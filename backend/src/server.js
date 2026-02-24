const express = require('express');
const cors = require('cors');
const env = require('./config/env');
const authRoutes = require('./routes/auth');
const usersRoutes = require('./routes/users');
const solicitacoesRoutes = require('./routes/solicitacoes');
const demandasRoutes = require('./routes/demandas');
const dashboardRoutes = require('./routes/dashboard');
const profileRoutes = require('./routes/profile');

const app = express();

app.use(cors({ origin: env.frontendUrl === '*' ? true : env.frontendUrl }));
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/solicitacoes', solicitacoesRoutes);
app.use('/api/demandas', demandasRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/profile', profileRoutes);

app.use((err, _req, res, _next) => {
  res.status(500).json({ error: err.message });
});

app.listen(env.port, () => {
  console.log(`Backend rodando na porta ${env.port}`);
});
