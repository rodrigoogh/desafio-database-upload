import Transaction from '../models/Transaction';
import csvParse from 'csv-parse';
import fs from 'fs';
import { getCustomRepository, getRepository, In } from 'typeorm';
import Category from '../models/Category';
import TransactionsRepository from '../repositories/TransactionsRepository';

interface CSVTransaction {
  title: string;
  type: 'income' | 'outcome';
  value: number;
  category: string;
}

class ImportTransactionsService {
  async execute(filepath: string): Promise<Transaction[]> {
    const transactionsRepository = getCustomRepository(TransactionsRepository);
    const categoriesRepository = getRepository(Category);

    const transactions = [] as CSVTransaction[];
    const categories = [] as string[];

    const fileReadStream = fs.createReadStream(filepath);
    const parser = csvParse({
      from_line: 2,
    });

    const parsedCSV = fileReadStream.pipe(parser);
    parsedCSV.on('data', async (line) => {
      const [title, type, value, category] = line.map((cell: string) => {
        return cell.trim();
      });

      if (!title || !type || !value) {
        return;
      }

      categories.push(category);
      transactions.push({title, value, type, category});

    });

    await new Promise(resolve => parsedCSV.on('end', resolve));

    const existentCategories = await categoriesRepository.find({
      where: {
        title: In(categories)
      }
    });

    const existentCategoriesTitles = existentCategories.map(category => category.title);

    const categoriesToAdd = categories.filter((category) => {
      return !existentCategoriesTitles.includes(category);
    }).filter((category, index, self) => self.indexOf(category) === index);

    const newCategories = categoriesRepository.create(
      categoriesToAdd.map(title => ({
        title
      }))
    );

    await categoriesRepository.save(newCategories);

    const allCategories = [...newCategories, ...existentCategories];

    const createdTransactions = transactionsRepository.create(
      transactions.map((transaction) => ({
        title: transaction.title,
        type: transaction.type,
        value: transaction.value,
        category: allCategories.find(category => category.title === transaction.category)
      }))
    );

    await transactionsRepository.save(createdTransactions);
    await fs.promises.unlink(filepath);

    return createdTransactions;
  }
}

export default ImportTransactionsService;
