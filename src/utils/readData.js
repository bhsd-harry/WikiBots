import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

function readData(name) {
	const __filename = fileURLToPath(import.meta.url);
	const __dirname = path.dirname(__filename);
	const filePath = path.join(__dirname, `../../data/${name}`);
  
	return new Promise((resolve, reject) => {
		fs.readFile(filePath, 'utf8', (error, data) => {
			if (error) {
				console.error(error);
				reject(error);
			} else {
				resolve(data);
			}
		});
	});
}

export default readData;