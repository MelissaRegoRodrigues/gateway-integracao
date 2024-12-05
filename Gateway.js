const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const axios = require('axios');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = 8088;

const SERVICES = {
    auth: 'http://localhost:8080/api/auth', // Serviço de autenticação, 8081 ta o front (Deu um bug cabuloso aqui quando errei a porta)
    base: 'https://760c-45-237-164-195.ngrok-free.app/api', // Serviço de posts

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

app.post('/api/auth/register', express.json(), async (req, res) => {

    const { username, email, password } = req.body;

    try {
        // Enviar dados ao microsserviço de autenticação
        const authResponse = await axios.post(`${SERVICES.auth}/register`, {
            username,
            email,
            password
        });

        console.log('Resposta do microsserviço de autenticação:', authResponse.status);
        const usuario = authResponse.data;

        console.log(usuario);

        // Enviar os dados ao microsserviço de posts
        const postsResponse = await axios.post(`${SERVICES.base}/usuarios/register`,  {
            id: usuario.userId,
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

// seguir um usuário
app.post('/api/usuarios/follow/:seguidorId/:alvoId', async (req, res) => {
    const {seguidorId, alvoId} = req.params

    try {
        // Enviar dados ao microsserviço de autenticação
        const baseResponse = await axios.post(`${SERVICES.base}/usuarios/follow/${seguidorId}/${alvoId}`);

        console.log('Resposta do microsserviço base:', baseResponse.status);


        // Retornar sucesso
        res.status(200).json(baseResponse.data);

    } catch (error) {
        // Capturar e exibir erro detalhado
        console.error('Erro ao seguir o usuário:', error.message);
        if (error.response) {
            console.error('Resposta de erro do servidor:', error.response.data);
        }
        res.status(500).json({ message: 'Erro ao seguir o usuário.' });
    }
});

app.post('/api/usuarios/unfollow/:seguidorId/:alvoId', async (req, res) => {
    const {seguidorId, alvoId} = req.params
    console.log(seguidorId, alvoId);

    try {
        // Enviar dados ao microsserviço de autenticação
        const baseResponse = await axios.post(`${SERVICES.base}/usuarios/unfollow/${seguidorId}/${alvoId}`);

        console.log('Resposta do microsserviço base:', baseResponse.status);


        // Retornar sucesso
        res.status(200).json(baseResponse.data);

    } catch (error) {
        // Capturar e exibir erro detalhado
        console.error('Erro ao seguir o usuário:', error.message);
        if (error.response) {
            console.error('Resposta de erro do servidor:', error.response.data);
        }
        res.status(500).json({ message: 'Erro ao seguir o usuário.' });
    }
});

// criar novo post
app.post(
    '/api/posts', express.json(),
    async (req, res) => {
        console.log(req.body)
        const {donoId, titulo, conteudo, hashTags} = req.body;
        const baseResponse = await axios.post(`${SERVICES.base}/posts`, {
            donoId,
            titulo,
            conteudo,
            hashTags});

        console.log(baseResponse.data.id)
        const kafkaResponse = await axios.post(`${SERVICES.base}/posts/${baseResponse.data.id}/send`)
        console.log(kafkaResponse)

        return res.status(201).json(baseResponse.data);
    }
);

app.get("/api/usuarios/:usuarioId", async (req, res) => {
    const {usuarioId} = req.params;
    const baseResponse = await axios.get(`${SERVICES.base}/usuarios/${usuarioId}`);

    return res.status(201).json(baseResponse.data);
})

//pegar posts de quem ta seguindo
app.get("/api/posts/seguidor/:usuarioId", async (req, res) => {
    const {usuarioId} = req.params;
    const baseResponse = await axios.get(`${SERVICES.base}/posts/seguidor/${usuarioId}`);
    return res.status(200).json(baseResponse.data);
})

// pegar todos os posts
app.get("/api/posts", async (req, res) =>{
    const baseResponse = await axios.get(`${SERVICES.base}/posts`);
    console.log(baseResponse.data);
    return res.status(200).json(baseResponse.data);
});

app.get("/api/posts/:postId", async (req, res) => {
    const {postId} = req.params;
    const baseResponse = await axios.get(`${SERVICES.base}/posts/${postId}`);
    return res.status(200).json(baseResponse.data)
})



app.listen(PORT, () => {
    console.log(`API Gateway rodando na porta ${PORT}`);
});
