const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const axios = require('axios');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = 8088;

const SERVICES = {
    auth: 'http://localhost:8080/api/auth', // Serviço de autenticação, 8081 ta o front (Deu um bug cabuloso aqui quando errei a porta)
    posts: 'http://localhost:8082', // Serviço de posts

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

app.post('/api/auth/register', async (req, res) => {
    const { username, email, password } = req.body;

    try {
        // Enviar dados ao microsserviço de autenticação
        const authResponse = await axios.post(`${SERVICES.auth}/register`, {
            username,
            email,
            password
        });

        console.log('Resposta do microsserviço de autenticação:', authResponse.status);


        // Enviar os dados ao microsserviço de posts
        const postsResponse = await axios.post(`${SERVICES.posts}/api/usuarios/register`,  {
            nome: username,
            email: email,
            senha: password,
            seguidores: null,
            seguindo: null
        });

        console.log('Resposta do microsserviço de posts:', postsResponse.status);
        console.log(res.json);

        // Retornar sucesso
        res.status(201).json({
            message: 'Usuário registrado com sucesso!'
        });

    } catch (error) {
        // Capturar e exibir erro detalhado
        console.error('Erro ao registrar o usuário:', error.message);
        if (error.response) {
            console.error('Resposta de erro do servidor:', error.response.data);
        }
        res.status(500).json({ message: 'Erro ao registrar o usuário.' });
    }
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

//pra que o get se tem o use depois e não precisa desse *, funciona pra pegar tudo assim: '/api
app.get(
    '/api/*',  // Captura qualquer requisição que comece com /api/
    enrichRequestWithUserData,
    createProxyMiddleware({
        target: SERVICES.posts,  // Defina o serviço de destino para redirecionar
        changeOrigin: true,      // Muda a origem para o servidor de destino
        pathRewrite: (path, req) => {
            console.log(`Reescrevendo o caminho de ${path}`);
            return path.replace(/^\/api/, '/api');  // O caminho é mantido como está
        },
        onProxyReq: (proxyReq, req, res) => {
            console.log(`Proxy headers: ${JSON.stringify(req.headers)}`);
            console.log(`Proxy para o caminho: ${req.url}`);
        },
        onError: (err, req, res) => {
            console.error(`Erro ao redirecionar para o serviço de posts: ${err.message}`);
            res.status(500).json({ error: 'Erro ao redirecionar a requisição para o serviço de posts.' });
        },
    })
);


app.use(
    '/api/usuarios',
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

app.use(
    '/api/*',  // Usando um wildcard para capturar qualquer coisa que comece com /api/
    enrichRequestWithUserData,
    createProxyMiddleware({
        target: SERVICES.posts, // O serviço para o qual você está redirecionando
        changeOrigin: true,      // Muda a origem para o destino, necessário para evitar problemas de CORS
        pathRewrite: (path, req) => {
            console.log(`Reescrevendo o caminho de ${path}`);
            // O path já é o que você quer no destino, então apenas retorna ele mesmo
            return path.replace(/^\/api/, '/api');  // Pode ser ajustado se necessário
        },
        onProxyReq: (proxyReq, req, res) => {
            console.log(`Proxy headers: ${JSON.stringify(req.headers)}`);
            console.log(`Proxy para o caminho: ${req.url}`);
        },
        onError: (err, req, res) => {
            console.error(`Erro ao redirecionar para o serviço de posts: ${err.message}`);
            res.status(500).json({ error: 'Erro ao redirecionar a requisição para o serviço de posts.' });
        },
    })
);

//pra que isso se tem o use la na frente, ele devia fazer esse trabalho já
app.get(
    '/api/usuarios',
    enrichRequestWithUserData,
    createProxyMiddleware({
        target: SERVICES.posts,
        changeOrigin: true,
        pathRewrite: { '^/api/usuarios': '' },
        onProxyReq: (proxyReq, req, res) => {
            console.log(`Proxy headers: ${JSON.stringify(req.headers)}`);
            console.log(`Proxy para Posts: ${req.url}`);
        },
        onError: (err, req, res) => {
            console.error(`Erro ao redirecionar para o serviço de posts: ${err.message}`);
            res.status(500).json({ error: 'Erro ao redirecionar a requisição para o serviço de posts.' });
        },
    })
);


app.listen(PORT, () => {
    console.log(`API Gateway rodando na porta ${PORT}`);
});
