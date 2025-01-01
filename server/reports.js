const express = require('express');
const fs = require('fs');
const app = express();
const PORT = 3000;
const path = require('path');
const geolib = require('geolib'); // Import the geolib library
const { Configuration, OpenAIApi } = require('openai');

// Initialize OpenAI

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});

const openai = new OpenAIApi(configuration);
  

// Serve static files (e.g., the HTML file)
app.use(express.static('public'));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../dashboard.html'));
});

function mergeSimilarIncidents(origIncidents, proximityThreshold, timeframe) {
    const mergedIncidents = [];
    const processedIncidents = new Set(); // Set to store processed incident IDs
  
    for (let i = 0; i < origIncidents.length; i++) {
      const incident1 = origIncidents[i];
      if (processedIncidents.has(incident1.uniqueId)) {
        continue;
      }
      
      let merged = false;
      let mergedIncident = {
          incidentId : i+1,
          incidentList : [incident1],
          occurences : 1
      };
  
      //incident1.description = `${incident1.description} By ${incident1.username} on ${incident1.date}`;
      let occurences = 1;

      for (let j = i + 1; j < origIncidents.length; j++) {
        const incident2 = origIncidents[j];
        if (processedIncidents.has(incident2.uniqueId)) {
            continue;
        }
  
        // Check if incidents are within the timeframe
        const date1 = new Date(incident1.date);
        const date2 = new Date(incident2.date);
        const timeDiff = Math.abs(date2 - date1) / (1000 * 60 * 60 * 24); // Time difference in days
        if (timeDiff > timeframe) {
          continue; // Skip if time difference exceeds timeframe
        }
  
        // Check if incidents have the same category
        if (incident1.category !== incident2.category) {
          continue; // Skip if categories don't match
        }
  
        // Calculate distance between two points (you can use a library like 'geolib')
        const distance = geolib.getDistance(
          { latitude: incident1.latitude, longitude: incident1.longitude },
          { latitude: incident2.latitude, longitude: incident2.longitude }
        );
  
        // Check if distance is within the threshold
        if (distance <= proximityThreshold) {
            mergedIncident.occurences += 1;
            mergedIncident.incidentList.push(incident2);           
            
            merged = true;
            processedIncidents.add(incident2.uniqueId); // Add incident2 to processed set
        }

      }
      
      mergedIncidents.push(mergedIncident);
    }
  
    return mergedIncidents;
  }
  


// Endpoint to get incident data
app.get('/api/incidents', async (req, res) => {
    fs.readFile('data/reports.txt', 'utf8', async (err, data) => {
        if (err) {
            console.error('Error reading file:', err);
            return res.status(500).send('Error reading file');
        }

        const reports = data.split('--------------------------------------------------------------');

        let incidents = [];
        
        for (let i=0; i < reports.length; i++) {
            const report = reports[i];
            const lines = report.trim().split('\n');

            if (lines.length < 6) continue;  //Skip incomplete entries

            const locationMatch = lines[4].match(/Location: \{.*\}/);

            location = null;
            if (locationMatch) {
                location = JSON.parse(locationMatch[0].split(': ')[1]);
            } 


            if (location) {
                incidents.push ({
                    uniqueId: lines[0].split(': ')[1],
                    username: lines[1].split(': ')[1],
                    date: lines[2].split(': ')[1],
                    category: lines[3].split(': ')[1],
                    latitude: location.lat,
                    longitude: location.lng,
                    description: lines[5].split(': ')[1],
                    occurences: 1
                });
            }
        }

        const mergedIncidents = mergeSimilarIncidents(incidents, 150, 7); // 150 meters proximity, 7 days timeframe
  
        res.json(mergedIncidents);
    });
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

app.use(express.json()); 

app.post('/update-user-points', (req, res) => {
  console.log(req.body);
  const { incidentList, isIssueValid } = req.body; 
  const pointsToAdd = isIssueValid ? 10 : -5;

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

    for (const incidentItem of incidentList) {
        let points = userPointsMap[incidentItem.username] || 0;
        points += pointsToAdd;
        userPointsMap[incidentItem.username] = points;
    }

    const updatedData = Object.entries(userPointsMap)
      .map(([user, points]) => `${user}:${points}`)
      .join('\n');

    fs.writeFile('data/user_points.txt', updatedData, 'utf8', (err) => {
      if (err) {
        console.error('Error writing user points file:', err);
        return res.status(500).send('Error updating user points.');
      }

      res.send('User points updated successfully.');
    });
  });
});

