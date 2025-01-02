const express = require('express');
const path = require('path');
const app = express();
const fs = require('fs');
const port = 3001;
//const bodyParser = require('body-parser');

app.use(express.json());
app.use(express.static('public'));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../login_page.html'));
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, '../main_page.html'));
});

app.get('/report', (req, res) => {
  res.sendFile(path.join(__dirname, '../report.html'));
});

app.get('/chat', (req, res) => {
  res.sendFile(path.join(__dirname, '../index.html'));
});

app.get('/profile', (req, res) => {
  res.sendFile(path.join(__dirname, '../profile.html'));
});

//app.use(bodyParser.json());

app.post('/submit-report', (req, res) => {
  const reportData = req.body;
  
  //Generate unique identifier

  const username = reportData.username;
  const dateTime = reportData.dateTime;
  const uniqueId = reportData.uniqueId;
  const image = reportData.image;

  // Prepare the data to be written to a file
  const filePath = path.join(__dirname, 'data', 'reports.txt');
  const reportString = `
UniqueId: ${uniqueId}
Username: ${username}
Date: ${dateTime}
Category: ${reportData.category}
Location: ${JSON.stringify(reportData.location)}
Description: ${reportData.description}
--------------------------------------------------------------
`;

  // Append the report data to the file
  fs.appendFile(filePath, reportString, (err) => {
    if (err) {
      console.error('Error writing to file:', err);
      return res.status(500).send('Failed to save the report');
    }

    // Process the image data (e.g., decode base64, save to file)
    const imageBuffer = Buffer.from(image.replace(/^data:image\/(png|jpeg|jpg);base64,/, ''), 'base64'); 
    const filename = `${uniqueId}.jpg`;
    // Save image to file (replace with your desired storage method)
    fs.writeFileSync(path.join(__dirname, 'uploads', filename), imageBuffer); 

    console.log('Report saved successfully');
    res.status(200).send('Report saved successfully');
  });
});


app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});

require('dotenv').config();
const { Configuration, OpenAIApi } = require('openai');
const { LocalIndex } = require('vectra');

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

const index = new LocalIndex(path.join(__dirname, 'vector_db'));

// Initialize the vector database
async function initVectorDB() {
  if (!(await index.isIndexCreated())) {
    await index.createIndex();
  }
}


initVectorDB();

app.post('/chat', async (req, res) => {
  try {
    const { message } = req.body;
    console.log("DEBUG: " + "message:" + message);
    // Get embedding for the user's message
    const embedding = await getEmbedding(message);
    console.log("DEBUG: " + "embedding:" + embedding);
    // Query the vector database
    const results = await index.queryItems(embedding, 3);
    console.log("DEBUG: " + "result:" + results);
    // Prepare context from vector search results
    const context = results.map(r => r.item.metadata.text).join('\n');
    
    // Generate response using OpenAI
    const completion = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "You are a helpful assistant. Your name is MaVI, a Markham smart city helpful assistant. You will help assist the citizens of markham. Be casual with them and engaging at the same time.Use only the following context wihtout going beyond it to answer the user's question.  If you dont find the answer within the provided context, then say that you cannot help.  \n Context:  " + context },
        { role: "user", content: message }
      ],
    });

    res.json({ response: completion.data.choices[0].message.content });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'An error occurred' });
  }
});

async function getEmbedding(text) {
  console.log("Debug: "+ "inside getEmbedding");

  const response = await openai.createEmbedding({
    model: "text-embedding-ada-002",
    input: text,
  });

  console.log("Debug: "+ "finish getEmbedding: " + response);
  return response.data.data[0].embedding;
}

app.post('/userPoints', async (req, res) => {
  const { username } = req.body;
  console.log(username);
  fs.readFile('data/user_points.txt', 'utf8', (err, data) => {
    if (err) {
      console.error('Error reading user points file:', err);
      return res.status(500).send('Error reading user points.');
    }

    const userPointsMap = {};
    data.split('\n').forEach(line => {
      if (line) {
        const [user, points] = line.split(':');
        userPointsMap[user] = parseInt(points);
      }
    });

    let userPoints = userPointsMap[username] || 0;
    console.log(userPoints);
    res.json({ userPoints: userPoints});
  })
}); 

