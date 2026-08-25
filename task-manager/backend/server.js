const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const { SecretsManagerClient, GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager");

const app = express();
app.use(cors());
app.use(express.json());

// Initialize AWS Secrets Manager Client (IAM handles credentials automatically when deployed)
const secretsClient = new SecretsManagerClient({ region: "us-east-2" });

let pool;

async function initDb() {
  try {
    // Fetch the DB Password securely from Secrets Manager
    const command = new GetSecretValueCommand({
      SecretId: "prod/db_password",
    });
    const secretResponse = await secretsClient.send(command);

    // Secrets Manager can store either a plain string or a JSON blob.
    // If you used "Credentials for RDS database" when creating the secret,
    // it stores JSON like { "username": "...", "password": "..." } — handle both cases.
    let dbPassword;
    try {
      const parsed = JSON.parse(secretResponse.SecretString);
      dbPassword = parsed.password;
    } catch {
      // Not JSON — it's a plain string secret
      dbPassword = secretResponse.SecretString;
    }

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