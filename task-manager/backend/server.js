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
    // Fetch the DB credentials securely from Secrets Manager
    const command = new GetSecretValueCommand({
      SecretId: "prod/db_password",
    });
    const secretResponse = await secretsClient.send(command);

    // This secret was created via "Credentials for RDS database", so it's
    // a JSON blob containing username, password, host, port, etc.
    const secret = JSON.parse(secretResponse.SecretString);

    // Connect to RDS / Aurora PostgreSQL Instance
    pool = new Pool({
      user: secret.username,
      host: process.env.DB_HOST, // Set via ECS Environment Variable
      database: 'postgres',
      password: secret.password,
      port: 5432,
      ssl: {
        rejectUnauthorized: false
      }
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