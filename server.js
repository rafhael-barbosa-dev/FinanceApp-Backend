// server.js - Versão Completa (GET, ADD, UPDATE) usando googleapis

// 1. IMPORTAÇÕES E SETUP
require('dotenv').config(); 
const express = require('express');
const { google } = require('googleapis'); 
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// 2. CONFIGURAÇÃO DE CORS
const allowedOrigins = ['https://rafhael-barbosa-dev.github.io', 'http://localhost:5173/FinanceApp/', 'http://localhost:5173']; 
const corsOptions = {
  origin: allowedOrigins,
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));
app.use(express.json());

// 3. AUTENTICAÇÃO GOOGLEAPIS
const auth = new google.auth.JWT({
  email: process.env.SERVICE_ACCOUNT_EMAIL,
  key: process.env.PRIVATE_KEY.replace(/\\n/g, '\n'), // Trata as quebras de linha
  scopes: ['https://www.googleapis.com/auth/spreadsheets'], 
});

const sheets = google.sheets({ version: 'v4', auth });
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

// --- CONFIGURAÇÃO DAS ABAS E COLUNAS ---
// ATENÇÃO: Verifique se estes nomes de abas e mapeamentos de colunas correspondem
// EXATAMENTE aos nomes e ordem da sua planilha.
const SHEET_NAMES = {
    REGISTRO: 'Registro', 
    METAS: 'Metas', 
    ORGANIZADORES: 'Organizadores' 
};

// Mapeamento de Cabeçalho para Letra da Coluna (para o endpoint de UPDATE)
// Baseado na ordem padrão: A=Data, B=Tipo, C=Valor, D=Descricao, etc.
const COLUMN_MAP = {
    'Data': 'A',
    'Tipo': 'B',
    'Valor': 'C',
    'Descricao': 'D',
    'Tag_1': 'E',
    'Tag_2': 'F',
    'Tag_3': 'G',
    'Tag_4': 'H',
    // Adicione mais mapeamentos se sua planilha tiver mais colunas
};

// --- FUNÇÕES UTILITÁRIAS DE DADOS ---

// Recria a lógica de mapeamento para retornar um objeto rawData ao Frontend
const mapHeadersToObjects = (rows) => {
    if (!rows || rows.length === 0) return [];
    const headers = rows[0].map(h => h.toString().trim()); // Cabeçalhos limpos
    
    // Ignora a linha de cabeçalho (index 0)
    return rows.slice(1).map((row, index) => {
        const obj = {};
        // ROW_NUMBER é o índice real da linha (cabeçalho + índice da linha de dados)
        obj.ROW_NUMBER = index + 2; 
        
        headers.forEach((header, colIndex) => {
            obj[header] = row[colIndex] !== undefined ? row[colIndex] : ''; 
        });
        return obj;
    });
};

// --- AUTENTICAÇÃO ---
async function authenticateSheet() {
  try {
    const response = await sheets.spreadsheets.get({
      spreadsheetId: SPREADSHEET_ID,
      fields: 'properties.title'
    });
    console.log(`Planilha carregada e autenticada: ${response.data.properties.title}`);
  } catch (error) {
    console.error("Erro na autenticação da planilha. Verifique as chaves e o compartilhamento:", error.message);
    throw new Error("Falha na autenticação da Sheets API.");
  }
}

// 4. NOVO: ENDPOINT PARA LEITURA DE TODOS OS DADOS (GET)
app.get('/api/get-all-data', async (req, res) => {
    try {
        const ranges = [
            `${SHEET_NAMES.REGISTRO}!A:Z`,
            `${SHEET_NAMES.METAS}!A:Z`,
            `${SHEET_NAMES.ORGANIZADORES}!A:Z`,
        ];

        const response = await sheets.spreadsheets.values.batchGet({
            spreadsheetId: SPREADSHEET_ID,
            ranges: ranges,
            majorDimension: 'ROWS',
        });

        const rawData = {
            registro: mapHeadersToObjects(response.data.valueRanges[0].values),
            metas: mapHeadersToObjects(response.data.valueRanges[1].values),
            organizadores: mapHeadersToObjects(response.data.valueRanges[2].values),
        };
        
        // O Frontend (App.jsx) espera este objeto
        return res.status(200).json(rawData);

    } catch (error) {
        console.error("Erro ao ler dados da planilha:", error.message);
        return res.status(500).json({ success: false, message: 'Falha ao ler dados da Sheets API.', error: error.message });
    }
});


// 5. ENDPOINT PARA ADICIONAR REGISTRO (POST)
app.post('/api/add-registro', async (req, res) => {
    const data = req.body; 

    if (!data.Data) {
        return res.status(400).json({ success: false, message: 'Dados incompletos: Data é obrigatória.' });
    }
    
    // Cria um array de valores na ordem das colunas da planilha (A, B, C, D...)
    const rowValues = [
        data.Data,
        data.Tipo || '',
        data.Valor,
        data.Descricao || '',
        data.Tag_1 || '',
        data.Tag_2 || '',
        data.Tag_3 || '',
        data.Tag_4 || '',
        // Adicione mais campos aqui se necessário
    ];
    
    const resource = {
        values: [rowValues],
    };

    try {
        const response = await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: `${SHEET_NAMES.REGISTRO}!A:Z`, 
            valueInputOption: 'USER_ENTERED',
            resource,
        });
        
        return res.status(200).json({ success: true, message: 'Registro adicionado com sucesso!', updates: response.data });

    } catch (error) {
        console.error("Erro ao adicionar linha:", error);
        return res.status(500).json({ success: false, message: 'Falha ao adicionar linha na Sheets API.', error: error.message });
    }
});


// 6. NOVO: ENDPOINT PARA ATUALIZAR REGISTRO (POST)
app.post('/api/update-registro', async (req, res) => {
    // Espera-se: ROW_NUMBER (número da linha), column (nome do cabeçalho), value (novo valor)
    const { ROW_NUMBER, column, value } = req.body;
    
    if (!ROW_NUMBER || !column || value === undefined) {
        return res.status(400).json({ success: false, message: 'Dados incompletos para atualização (ROW_NUMBER, column, ou value ausentes).' });
    }
    
    const targetColLetter = COLUMN_MAP[column];

    if (!targetColLetter) {
        // Isso resolve a causa do 400 se o Frontend estiver enviando um nome de coluna não mapeado.
        return res.status(400).json({ success: false, message: `Coluna desconhecida ou não mapeada para letra: ${column}. Verifique o mapeamento no backend.` });
    }

    // Range: [Nome da Aba]![Letra da Coluna][Número da Linha]
    const range = `${SHEET_NAMES.REGISTRO}!${targetColLetter}${ROW_NUMBER}`; 
    
    const resource = {
        values: [
            [value] // O novo valor da célula
        ],
    };

    try {
        const response = await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: range,
            valueInputOption: 'USER_ENTERED',
            resource,
        });

        return res.status(200).json({ success: true, message: `Registro na linha ${ROW_NUMBER} (${column}) atualizado com sucesso!`, updates: response.data });
        
    } catch (error) {
        console.error("Erro ao atualizar linha:", error);
        return res.status(500).json({ success: false, message: 'Falha ao atualizar linha na Sheets API.', error: error.message });
    }
});


// 7. INICIA O SERVIDOR
authenticateSheet().then(() => {
  app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
    console.log(`Endpoint de leitura: /api/get-all-data`);
    console.log(`Endpoint de escrita: /api/add-registro`);
    console.log(`Endpoint de atualização: /api/update-registro`);
  });
}).catch((error) => {
    console.error(`Servidor não iniciado devido a falha crítica na autenticação: ${error.message}`);
});