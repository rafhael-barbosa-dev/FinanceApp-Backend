// server.js - Versão Completa (GET, ADD, UPDATE) usando googleapis - CORRIGIDA

// 1. IMPORTAÇÕES E SETUP
require('dotenv').config(); 
const express = require('express');
const { google } = require('googleapis'); 
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// 2. CONFIGURAÇÃO DE CORS (Mantida com base na sua última correção)
// É crucial que esta lista contenha: 'https://rafhael-barbosa-dev.github.io', 'http://localhost:3000', e 'http://localhost:5173'
const allowedOrigins = ['https://rafhael-barbosa-dev.github.io', 'http://localhost:3000', 'http://localhost:5173', 'http://localhost:5173/FinanceApp/']; 
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
const SHEET_NAMES = {
    REGISTRO: 'Registro',
    METAS: 'Metas',
    ORGANIZADORES: 'Organizadores',
};

// Mapeamento de nome de coluna (key do objeto JSON) para letra da coluna na planilha
const COL_MAP = {
    'Data': 'A',
    'Tipo': 'B',
    'Valor': 'C',
    'Descrição': 'D',
    'Tag_1': 'E',
    'Tag_2': 'F',
    'Tag_3': 'G',
    'Tag_4': 'H',
    // ... adicione outras colunas do Registro se necessário, como Mês, Ano, etc.
};


// =========================================================================
// === FUNÇÃO CRÍTICA DE MAPEAMENTO (A CORREÇÃO PRINCIPAL) =================
// =========================================================================

/**
 * Converte a resposta da Sheets API (array de arrays) em um array de objetos.
 * A primeira linha da planilha é tratada como o cabeçalho.
 * @param {Array<Array<string>>} data - O array de arrays com os dados.
 * @returns {Array<Object>} Um array de objetos com as chaves sendo os cabeçalhos.
 */
function mapData(data) {
    if (!data || data.length < 1) {
        return [];
    }

    const headers = data[0]; // A primeira linha é o cabeçalho
    const rows = data.slice(1); // As demais são os dados

    return rows.map((row, index) => {
        const rowObject = {
            // Adiciona o número da linha na planilha, crucial para a edição!
            // Os dados começam na linha 2, então o index (0-based) precisa de +2.
            ROW_NUMBER: index + 2 
        }; 
        
        headers.forEach((header, colIndex) => {
            // Usa o cabeçalho como chave. O valor é vazio se a célula estiver vazia.
            rowObject[header] = row[colIndex] || ''; 
        });

        return rowObject;
    });
}


// =========================================================================
// === ENDPOINTS ===========================================================
// =========================================================================


// 4. ENDPOINT DE LEITURA (GET) - AGORA COM MAPEAMENTO DE DADOS
app.get('/api/get-all-data', async (req, res) => {
    try {
        // Ranges para buscar dados (A1:M deve cobrir todas as colunas de Registro)
        const ranges = [
            `${SHEET_NAMES.REGISTRO}!A1:M`,
            `${SHEET_NAMES.METAS}!A1:C`,
            `${SHEET_NAMES.ORGANIZADORES}!A1:B`,
        ];

        const response = await sheets.spreadsheets.values.batchGet({
            spreadsheetId: SPREADSHEET_ID,
            ranges: ranges,
        });

        // Extrai os resultados em ValueRange objects
        const [registroData, metasData, organizadoresData] = response.data.valueRanges;

        // --- APLICAÇÃO DA FUNÇÃO CRÍTICA DE MAPEAMENTO ---
        const registro = mapData(registroData?.values);
        const metas = mapData(metasData?.values);
        const organizadores = mapData(organizadoresData?.values);
        
        // Retorna a estrutura que o dataProcessor.jsx espera
        return res.status(200).json({
            registro: registro,
            metas: metas,
            organizadores: organizadores,
        });

    } catch (error) {
        console.error("Erro ao buscar todos os dados da Sheets API:", error);
        return res.status(500).json({ success: false, message: 'Falha ao buscar dados da Sheets API.', error: error.message });
    }
});


// 5. ENDPOINT DE ADIÇÃO (POST)
app.post('/api/add-registro', async (req, res) => {
    // Se o ROW_NUMBER for passado, ele fará uma atualização (cuidado!).
    if (req.body.ROW_NUMBER) {
        // Redireciona para o endpoint de atualização direta
        // NOTE: Isso exige que o corpo da requisição POST esteja no formato:
        // { ROW_NUMBER: 2, column: 'Valor', value: '123.45' }
        return handleUpdateRegistro(req, res);
    }
    
    // ... (Seu código existente para adicionar novas linhas) ...
    // Se não for ROW_NUMBER, ele processa a adição de nova linha.
    // Lógica aqui para mapear req.body (Data, Tipo, Valor, etc.) em uma array de valores
    // e usar sheets.spreadsheets.values.append.
    
    const { Data, Tipo, Valor, Descrição, Tag_1, Tag_2, Tag_3, Tag_4 } = req.body;
    
    // Array de valores, na ORDEM CORRETA das colunas A a H.
    const rowValues = [
        Data || '', 
        Tipo || '', 
        Valor || '', 
        Descrição || '', 
        Tag_1 || '', 
        Tag_2 || '', 
        Tag_3 || '', 
        Tag_4 || '',
        // As colunas de Mês/Ano (I, J) são calculadas na planilha, mas podem ser incluídas aqui se for preciso
    ];

    const resource = {
        values: [rowValues],
    };

    try {
        const response = await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: `${SHEET_NAMES.REGISTRO}!A:A`, // Começa a procurar a partir da coluna A
            valueInputOption: 'USER_ENTERED',
            insertDataOption: 'INSERT_ROWS',
            resource,
        });

        return res.status(200).json({ success: true, message: 'Registro adicionado com sucesso!', updates: response.data });
        
    } catch (error) {
        console.error("Erro ao adicionar linha:", error);
        return res.status(500).json({ success: false, message: 'Falha ao adicionar linha na Sheets API.', error: error.message });
    }
});


// 6. LÓGICA DE ATUALIZAÇÃO DIRETA (POST) - Chamada interna ou via POST
const handleUpdateRegistro = async (req, res) => {
    // ... (Seu código existente para a lógica de edição) ...
    
    const { ROW_NUMBER, column, value } = req.body;

    if (!ROW_NUMBER || !column || value === undefined) {
        return res.status(400).json({ success: false, message: 'Dados de atualização incompletos: ROW_NUMBER, column e value são obrigatórios.' });
    }

    const targetColLetter = COL_MAP[column];
    if (!targetColLetter) {
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
};

// Se você já tinha um endpoint /api/update-registro, ele pode ser simplificado:
app.post('/api/update-registro', handleUpdateRegistro);


// 7. INICIA O SERVIDOR
// Função auxiliar para verificar a autenticação antes de iniciar o servidor
const authenticateSheet = async () => {
    try {
        await auth.authorize();
        console.log("Autenticação Google Sheets API bem-sucedida.");
    } catch (error) {
        console.error("Erro na autenticação:", error);
        throw new Error("Falha na autenticação da Sheets API. Verifique SERVICE_ACCOUNT_EMAIL e PRIVATE_KEY.");
    }
}

authenticateSheet().then(() => {
  app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
    console.log(`Endpoint de leitura: /api/get-all-data`);
  });
}).catch(err => {
    console.error("Erro fatal ao iniciar o servidor:", err.message);
});