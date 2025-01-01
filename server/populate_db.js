require('dotenv').config();
const { Configuration, OpenAIApi } = require('openai');
const { LocalIndex } = require('vectra');
const path = require('path');
const fs = require('fs').promises;
const pdf = require('pdf-parse');

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

const index = new LocalIndex(path.join(__dirname, 'vector_db'));

async function getEmbedding(text) {
  const response = await openai.createEmbedding({
    model: "text-embedding-ada-002",
    input: text,
  });
  return response.data.data[0].embedding;
}

async function addKnowledge(text) {
  const chunks = splitTextIntoChunks(text, 1000); // 1000 characters per chunk

  for (const chunk of chunks) {
    const vector = await getEmbedding(chunk);
    await index.insertItem({ vector, metadata: { text: chunk } });
  }
}

function splitTextIntoChunks(text, chunkSize) {
  const chunks = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push(text.slice(i, i + chunkSize));
  }
  return chunks;
}

async function readPDFFiles(directory) {
  const files = await fs.readdir(directory);
  const knowledgeTexts = [];

  for (const file of files) {
    if (path.extname(file).toLowerCase() === '.pdf') {
      const filePath = path.join(directory, file);
      const dataBuffer = await fs.readFile(filePath);
      const pdfContent = await pdf(dataBuffer);
      knowledgeTexts.push(pdfContent.text);
    }
  }

  return knowledgeTexts;
}

async function populateDB() {
  await index.createIndex();
  
  const knowledgeDirectory = path.join(__dirname, 'knowledge_docs');
  const knowledgeTexts = await readPDFFiles(knowledgeDirectory);

  for (const text of knowledgeTexts) {
    await addKnowledge(text);
  }

  console.log("Database populated successfully.");
}

populateDB();

