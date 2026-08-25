const express = require('express');
const { Pool } = require('pg');
const { SSMClient, GetParameterCommand } = require("@aws-sdk/client-ssm");

const app = express();
app.use(express.json());

// Initialize AWS SSM Client (IAM handles credentials automatically when deployed)
const ssmClient = new SSMClient({ region: "us-east-1" });

let pool;

async function initDb() {
  try {
    // Fetch the DB Password safely from SSM Parameter Store (Free alternative to Secrets)
    const command = new GetParameterCommand({
      Name: "/prod/db_password",
      WithDecryption: true,
    });
    const ssmResponse = await ssmClient.send(command);
    const dbPassword = ssmResponse.Parameter.Value;

    // Connect to RDS / Aurora PostgreSQL Instance
    pool = new Pool({
      user: 'db_admin',
      host: process.env.DB_HOST, // Set via ECS Environment Variable
      database: 'taskdb',
      password: dbPassword,
      port: 5432,
    });
    
    // Create a simple table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL
      );
    `);
    console.log("Connected to Database successfully.");
  } catch (err) {
    console.error("Database setup failed:", err);
  }
}

// API Routes
app.get('/api/tasks', async (req, res) => {
  const result = await pool.query('SELECT * FROM tasks');
  res.json(result.rows);
});

app.post('/api/tasks', async (req, res) => {
  const { title } = req.body;
  const result = await pool.query('INSERT INTO tasks (title) VALUES ($1) RETURNING *', [title]);
  res.json(result.rows[0]);
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  initDb();
});

