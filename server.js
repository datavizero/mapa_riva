// server.js
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Pool } = require('pg');
const { Parser } = require('json2csv');
const axios = require('axios');  // Añadir axios
require('dotenv').config();

const app = express();
app.use(bodyParser.json());
app.use(cors());

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

// Función para verificar reCAPTCHA
async function verifyRecaptcha(token) {
    const secretKey = process.env.RECAPTCHA_SECRET_KEY;
    const response = await axios.post(`https://www.google.com/recaptcha/api/siteverify`, null, {
        params: {
            secret: secretKey,
            response: token
        }
    });
    return response.data.success;
}

app.post('/locations', async (req, res) => {
    const { lat, lng, name, rating, recaptcha } = req.body;

    try {
        // Verificar reCAPTCHA
        const isRecaptchaValid = await verifyRecaptcha(recaptcha);
        if (!isRecaptchaValid) {
            return res.status(400).json({ message: 'Fallo en la verificación de reCAPTCHA. Inténtalo de nuevo.' });
        }

        // Verificar nombre duplicado
        const duplicateCheck = await pool.query('SELECT * FROM locations WHERE LOWER(name) = LOWER($1)', [name]);
        if (duplicateCheck.rowCount > 0) {
            return res.status(400).json({ message: 'El nombre ya existe. Por favor, elige un nombre diferente.' });
        }

        const result = await pool.query(
            'INSERT INTO locations (lat, lng, name, rating, timestamp) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [lat, lng, name, rating, new Date().toISOString()]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/locations', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM locations');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/locations/:id', async (req, res) => {
    const { id } = req.params;
    const { lat, lng, name, rating } = req.body;

    try {
        const result = await pool.query(
            'UPDATE locations SET lat = $1, lng = $2, name = $3, rating = $4 WHERE id = $5 RETURNING *',
            [lat, lng, name, rating, id]
        );
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Ubicación no encontrada' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/locations/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const result = await pool.query('DELETE FROM locations WHERE id = $1 RETURNING *', [id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Ubicación no encontrada' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/download-csv', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM locations');
        const fields = ['lat', 'lng', 'name', 'rating', 'timestamp'];
        const opts = { fields };
        const parser = new Parser(opts);
        const csv = parser.parse(result.rows);

        res.header('Content-Type', 'text/csv');
        res.attachment('locations.csv');
        res.send(csv);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/', (req, res) => {
    res.send('Backend funcionando correctamente');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
