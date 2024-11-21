const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const axios = require('axios');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = 8088;

const SERVICES = {
    auth: 'http://localhost:8080/api/auth', // Serviço de autenticação, 8081 ta o front (Deu um bug cabuloso aqui quando errei a porta)
    posts: 'http://localhost:8082', // Serviço de posts
    notifications: 'http://localhost:8083', // Serviço de notificações
};

//JWT
const authenticate = async (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1]; // Bearer <token>
    if (!token) {
        return res.status(401).json({ error: 'Token não fornecido' });
    }

    try {
        // Valida o token via microsserviço de autenticação
        const response = await axios.get(`${SERVICES.auth}/validate-token`, {
            headers: { Authorization: `Bearer ${token}` },
        });

        // Adiciona os dados do usuário ao request
        req.user = response.data; // Exemplo: { id: '123', email: 'user@example.com', username: 'user' }
        next();
    } catch (err) {
        console.error('Erro ao validar token:', err.message);
        res.status(401).json({ error: 'Token inválido ou expirado' });
    }
};

//enviar dados pro usuario
const enrichRequestWithUserData = (req, res, next) => {
    if (req.user) {
        // Adiciona os dados do usuário nos headers para repassá-los aos outros serviços
        req.headers['user-id'] = req.user.id;
        req.headers['user-email'] = req.user.email;
        req.headers['user-username'] = req.user.username;
    }
    next();
};

app.use((req, res, next) => {
    console.log(`Requisição recebida: ${req.method} ${req.url}`);
    next();
});


app.use(
    '/api/auth',
    createProxyMiddleware({
        target: SERVICES.auth,
        changeOrigin: true,
        onProxyReq: (proxyReq, req, res) => {
            console.log('Cabeçalhos recebidos pela Gateway:', req.headers);
        },
        onError: (err, req, res) => {
            console.error('Erro no Proxy:', err);
            res.status(500).send('Erro ao redirecionar a requisição.');
        }
    })
);

//url de teste pra urls protegidas (posts, home)
app.get('/home', authenticate, (req, res) => {
    res.status(200).json({
        message: 'Rota protegida acessada com sucesso!',
        user: req.user,
    });
});



app.listen(PORT, () => {
    console.log(`API Gateway rodando na porta ${PORT}`);
});
