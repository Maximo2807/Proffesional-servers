// backend/server.js - CÓDIGO FINAL Y COMPLETO CON TODAS LAS FUNCIONES

const express = require('express');
const cors = require('cors');
const http =require('http');
const { Server } = require("socket.io");
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const multer = require('multer');
const { exec } = require('child_process');
const Docker = require('dockerode');
const { Rcon } = require('rcon-client');

const app = express();
const server = http.createServer(app);
const PORT = 3000;
const SERVER_DATA_PATH = process.env.SERVER_DATA_PATH || '/minecraft-server-data';

const docker = new Docker({ socketPath: '/var/run/docker.sock' });
const { MINECRAFT_CONTAINER_NAME, MINECRAFT_RCON_HOST, MINECRAFT_RCON_PORT, MINECRAFT_RCON_PASSWORD } = process.env;

const dbDir = path.join(__dirname, 'data');
if (!fsSync.existsSync(dbDir)) { fsSync.mkdirSync(dbDir); }
const dbPath = path.join(dbDir, 'panel_users.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error("DB Error:", err.message);
    else {
        console.log("Conectado a SQLite.");
        db.run(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE, password TEXT NOT NULL, firstName TEXT, lastName TEXT, dob TEXT)`);
    }
});

app.use(cors({ origin: "*" }));
app.use(express.json());
const io = new Server(server, { cors: { origin: "*" } });

// --- Autenticación ---
app.post('/api/auth/register', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ message: 'Usuario y contraseña obligatorios.' });
    bcrypt.hash(password, 10, (err, hash) => {
        if (err) return res.status(500).json({ message: 'Error al encriptar.' });
        const sql = `INSERT INTO users (username, password, firstName, lastName, dob) VALUES (?, ?, '', '', '')`;
        db.run(sql, [username, hash], function(err) {
            if (err) {
                if (err.message.includes("UNIQUE constraint failed")) return res.status(409).json({ message: 'El usuario ya existe.' });
                return res.status(500).json({ message: 'Error al registrar.' });
            }
            res.status(201).json({ message: 'Usuario registrado con éxito. Ahora puedes iniciar sesión.' });
        });
    });
});
app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    db.get(`SELECT * FROM users WHERE username = ?`, [username], (err, user) => {
        if (err || !user) return res.status(401).json({ message: 'Credenciales inválidas.' });
        bcrypt.compare(password, user.password, (err, isMatch) => {
            if (isMatch) res.json({ success: true });
            else res.status(401).json({ message: 'Credenciales inválidas.' });
        });
    });
});

// --- Control del Servidor ---
async function getMinecraftContainer() { try { const c = docker.getContainer(MINECRAFT_CONTAINER_NAME); await c.inspect(); return c; } catch (e) { return null; } }
app.get('/api/server/status', async (req, res) => { const c = await getMinecraftContainer(); if (!c) return res.status(404).json({ status: 'off' }); const data = await c.inspect(); res.json({ status: data.State.Status === 'running' ? 'on' : 'off' }); });
app.post('/api/server/:action(start|stop)', async (req, res) => { const c = await getMinecraftContainer(); if (!c) return res.status(404).send(); await c[req.params.action](); res.json({ success: true }); });

// --- RCON y Jugadores ---
async function executeRconCommand(command) { try { const rcon = await Rcon.connect({ host: MINECRAFT_RCON_HOST, port: MINECRAFT_RCON_PORT, password: MINECRAFT_RCON_PASSWORD }); const response = await rcon.send(command); await rcon.end(); return response; } catch (e) { console.error("RCON Error:", e.message); return null; } }
app.get('/api/server/players', async (req, res) => { const response = await executeRconCommand('list'); if (response === null) return res.status(500).json({ error: 'No se pudo conectar con RCON. ¿El servidor está encendido?' }); const match = response.match(/online:(.*)/); if (!match || !match[1]) return res.json({ players: [] }); const playerNames = match[1].trim().split(', ').filter(Boolean); const players = playerNames.map(name => ({ name, avatar: `https://cravatar.eu/helmavatar/${name}/80.png` })); res.json({ players }); });
app.post('/api/server/command', async (req, res) => { await executeRconCommand(req.body.command); res.json({ success: true }); });
app.post('/api/server/:action(kick|ban)', async (req, res) => { await executeRconCommand(`${req.params.action} ${req.body.player}`); res.json({ success: true }); });

// --- Explorador de Archivos ---
app.get('/api/files/list', async (req, res) => { try { const reqPath = req.query.path || '/'; const safePath = path.normalize(reqPath).replace(/^(\.\.(\/|\\|$))+/, ''); const fullPath = path.join(SERVER_DATA_PATH, safePath); const dirents = await fs.readdir(fullPath, { withFileTypes: true }); const files = await Promise.all(dirents.map(async (d) => ({ name: d.name, isDir: d.isDirectory(), path: path.join(safePath, d.name) }))); res.json(files); } catch (e) { res.status(500).json({ error: 'No se pudo leer el directorio.' }); } });
app.get('/api/files/content', async (req, res) => { try { const reqPath = req.query.path; const safePath = path.normalize(reqPath).replace(/^(\.\.(\/|\\|$))+/, ''); const fullPath = path.join(SERVER_DATA_PATH, safePath); const content = await fs.readFile(fullPath, 'utf-8'); res.json({ content }); } catch (e) { res.status(500).json({ error: 'No se pudo leer el archivo.' }); } });
app.post('/api/files/save', async (req, res) => { try { const { path: reqPath, content } = req.body; const safePath = path.normalize(reqPath).replace(/^(\.\.(\/|\\|$))+/, ''); const fullPath = path.join(SERVER_DATA_PATH, safePath); await fs.writeFile(fullPath, content, 'utf-8'); res.json({ success: true }); } catch (e) { res.status(500).json({ error: 'No se pudo guardar el archivo.' }); } });

// --- Mods y Ajustes ---
const storage = multer.diskStorage({ destination: (req, file, cb) => { const d = path.join(SERVER_DATA_PATH, 'mods'); fsSync.mkdirSync(d, { recursive: true }); cb(null, d); }, filename: (req, file, cb) => cb(null, file.originalname) });
const upload = multer({ storage });
app.get('/api/mods/list', async (req, res) => { try { const mods = await fs.readdir(path.join(SERVER_DATA_PATH, 'mods')); res.json({ mods: mods.filter(f => f.endsWith('.jar')) }); } catch (e) { res.json({ mods: [] }); } });
app.post('/api/mods/upload', upload.array('mods'), (req, res) => { res.json({ success: true, message: `${req.files.length} mods subidos.` }); });
app.get('/api/server/settings', (req, res) => { res.json({ VERSION: process.env.VERSION, TYPE: process.env.TYPE, FORGE_VERSION: process.env.FORGE_VERSION }); });
app.post('/api/server/recreate', (req, res) => {
    const { version, type, forge_version } = req.body;
    const envVars = `VERSION=${version} TYPE=${type} FORGE_VERSION=${forge_version}`;
    const command = `docker-compose stop minecraft-server && docker-compose rm -f minecraft-server && ${envVars} docker-compose up -d --no-deps minecraft-server`;
    exec(command, { cwd: path.join(__dirname, '..') }, (err) => { if (err) console.error("Recreate error:", err); });
    res.json({ success: true, message: 'Recreando servidor...' });
});

// --- Socket para Consola en Vivo ---
io.on('connection', async (socket) => { const c = await getMinecraftContainer(); if (!c) return; const logStream = await c.logs({ follow: true, stdout: true, stderr: true, tail: 100 }); logStream.on('data', chunk => socket.emit('log', chunk.toString('utf8'))); socket.on('disconnect', () => logStream.destroy()); });

server.listen(PORT, () => console.log(`Backend corriendo en http://localhost:${PORT}`));