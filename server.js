// server.js

// 1. IMPORTAÇÕES
require('dotenv').config(); // Carrega o arquivo .env
const express = require('express');

// Usamos a biblioteca oficial do Google para lidar com a autenticação de forma robusta
const { google } = require('googleapis'); 
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// 2. CONFIGURAÇÃO DE CORS (Crucial para o GitHub Pages)
// Substitua o placeholder pelo seu URL exato no GitHub Pages!
const allowedOrigins = ['https://rafhael-barbosa-dev.github.io']; 
const corsOptions = {
  origin: allowedOrigins,
  optionsSuccessStatus: 200 
};
app.use(cors(corsOptions));
app.use(express.json()); // Permite ler o corpo das requisições JSON

// 3. AUTENTICAÇÃO E INICIALIZAÇÃO DA PLANILHA (USANDO GOOGLEAPIS)

// 3.1 Configuração do JWT (JSON Web Token) para Conta de Serviço
const auth = new google.auth.JWT({
  email: process.env.SERVICE_ACCOUNT_EMAIL,
  // A chave privada é carregada do .env e as quebras de linha são tratadas
  key: process.env.PRIVATE_KEY.replace(/\\n/g, '\n'), 
  // Escopo necessário para leitura e escrita na planilha
  scopes: ['https://www.googleapis.com/auth/spreadsheets'], 
});

// 3.2 Cria o objeto de interação com a Sheets API
const sheets = google.sheets({ version: 'v4', auth });

async function authenticateSheet() {
  try {
    // Tenta obter o título da planilha para confirmar a autenticação
    const response = await sheets.spreadsheets.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      fields: 'properties.title'
    });
    
    console.log(`Planilha carregada e autenticada: ${response.data.properties.title}`);
  } catch (error) {
    console.error("Erro na autenticação da planilha. Verifique as chaves e o compartilhamento:");
    console.error("Detalhe do Erro:", error.message);
    // Lança um erro para impedir o servidor de iniciar sem autenticação
    throw new Error("Falha na autenticação da Sheets API.");
  }
}

// 4. ENDPOINT PARA ADICIONAR REGISTRO
app.post('/api/add-registro', async (req, res) => {
  // Os dados vêm do seu App React
  const { data, descricao, valor } = req.body; 
  
  if (!data || !descricao || !valor) {
    return res.status(400).json({ success: false, message: 'Dados incompletos (data, descricao ou valor faltando).' });
  }

  // ATENÇÃO: SUBSTITUA 'Sheet1' pelo nome exato da sua aba na planilha (ex: 'Transacoes')
  const sheetName = 'Sheet1'; 
  
  // Os valores a serem inseridos (como um array de arrays, para uma linha)
  const values = [
    [data, descricao, valor], 
  ];
  
  const resource = {
    values,
  };

  try {
    // Método para anexar (append) dados ao final da planilha
    const response = await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.SPREADSHEET_ID,
      // 'A:C' significa que os dados serão inseridos nas colunas A, B e C
      range: `${sheetName}!A:C`, 
      valueInputOption: 'USER_ENTERED', // Trata os valores como se fossem inseridos por um usuário (mantém formatação, etc.)
      resource,
    });
    
    return res.status(200).json({ 
      success: true, 
      message: 'Registro adicionado com sucesso!',
      updates: response.data
    });

  } catch (error) {
    console.error("Erro ao adicionar linha via Google Sheets API:", error);
    return res.status(500).json({ success: false, message: 'Falha ao comunicar com Google Sheets API.', error: error.message });
  }
});

// 5. INICIA O SERVIDOR
// Tenta autenticar a planilha antes de iniciar o servidor
authenticateSheet().then(() => {
  app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
    console.log(`Endpoint de escrita: /api/add-registro`);
  });
}).catch((error) => {
    // Se a autenticação falhar, o servidor não será iniciado
    console.error(`Servidor não iniciado devido a falha crítica na autenticação: ${error.message}`);
});