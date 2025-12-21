// server.js - ATUALIZADO: Suporte para Metas e Organizadores (Tags e Cores)

// 1. IMPORTAÇÕES E SETUP
require('dotenv').config(); 
const express = require('express');
const { google } = require('googleapis'); 
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// 2. CONFIGURAÇÃO DE CORS
const allowedOrigins = ['https://rafhael-barbosa-dev.github.io', 'http://localhost:3000']; 
const corsOptions = {
  origin: allowedOrigins,
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));
app.use(express.json());

// 3. AUTENTICAÇÃO GOOGLEAPIS
const auth = new google.auth.JWT({
  email: process.env.SERVICE_ACCOUNT_EMAIL,
  key: process.env.PRIVATE_KEY.replace(/\\n/g, '\n'),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'], 
});

const sheets = google.sheets({ version: 'v4', auth });
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

// --- CONFIGURAÇÃO DAS ABAS E COLUNAS ---
const SHEET_NAMES = {
    REGISTRO: 'Registro', 
    METAS: 'Metas', 
    ORGANIZADORES: 'Organizadores' 
};

// Mapeamento de colunas para a aba Registro
const COLUMN_MAP_REGISTRO = {
    'Data': 'A',
    'Valor': 'B',
    'Tag_1': 'C',
    'Tag_2': 'D',
    'Tag_3': 'E',
    'Tag_4': 'F',
    'Descricao': 'G',
    'Forma do pagamento': 'H',
    'Tipo': 'I',
};

// Mapeamento de colunas para a aba Metas
const COLUMN_MAP_METAS = {
    'Mes': 'A',
    'Tag': 'B',
    'Meta': 'C',
};

// Mapeamento de colunas para a aba Organizadores
const COLUMN_MAP_ORGANIZADORES = {
    'Tag': 'A',
    'Forma do pagamento': 'B',
    'Tipo': 'C',
    'Cor': 'D', // Coluna para a cor da tag
};

// Função auxiliar para mapear headers para objetos
const mapHeadersToObjects = (rows) => {
    if (!rows || rows.length === 0) return [];
    const headers = rows[0].map(h => h.toString().trim().replace('Descrição', 'Descricao')); 
    
    return rows.slice(1).map((row, index) => {
        const obj = {};
        obj.ROW_NUMBER = index + 2; 
        
        headers.forEach((header, colIndex) => {
            obj[header] = row[colIndex] !== undefined ? row[colIndex] : ''; 
        });
        return obj;
    });
};

// Função auxiliar para atualizar cor de célula (background)
async function updateCellBackground(sheetName, cellRange, colorHex) {
    try {
        // Converte hex para RGB
        const hex = colorHex.replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16) / 255;
        const g = parseInt(hex.substring(2, 4), 16) / 255;
        const b = parseInt(hex.substring(4, 6), 16) / 255;

        // Obtém o sheetId primeiro
        const sheetId = await getSheetId(sheetName);
        if (!sheetId) {
            console.error(`Aba ${sheetName} não encontrada`);
            return;
        }

        // Extrai linha e coluna do range (ex: "D5" -> linha 5, coluna D)
        const match = cellRange.match(/([A-Z]+)(\d+)/);
        if (!match) {
            console.error(`Formato de range inválido: ${cellRange}`);
            return;
        }

        const columnLetter = match[1];
        const rowNumber = parseInt(match[2]);

        const request = {
            spreadsheetId: SPREADSHEET_ID,
            resource: {
                requests: [{
                    updateCells: {
                        range: {
                            sheetId: sheetId,
                            startRowIndex: rowNumber - 1,
                            endRowIndex: rowNumber,
                            startColumnIndex: getColumnIndex(columnLetter) - 1,
                            endColumnIndex: getColumnIndex(columnLetter)
                        },
                        rows: [{
                            values: [{
                                userEnteredFormat: {
                                    backgroundColor: {
                                        red: r,
                                        green: g,
                                        blue: b,
                                        alpha: 1.0
                                    }
                                }
                            }]
                        }],
                        fields: 'userEnteredFormat.backgroundColor'
                    }
                }]
            }
        };

        await sheets.spreadsheets.batchUpdate(request);
    } catch (error) {
        console.error('Erro ao atualizar cor da célula:', error);
        // Não falha a requisição se a cor não puder ser atualizada
    }
}

// Função auxiliar para obter o ID da aba
async function getSheetId(sheetName) {
    const spreadsheet = await sheets.spreadsheets.get({
        spreadsheetId: SPREADSHEET_ID
    });
    const sheet = spreadsheet.data.sheets.find(s => s.properties.title === sheetName);
    return sheet ? sheet.properties.sheetId : null;
}

// Função auxiliar para converter letra de coluna em índice
function getColumnIndex(columnLetter) {
    let result = 0;
    for (let i = 0; i < columnLetter.length; i++) {
        result = result * 26 + (columnLetter.charCodeAt(i) - 'A'.charCodeAt(0) + 1);
    }
    return result;
}

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

// 4. ENDPOINT PARA LEITURA DE TODOS OS DADOS (GET)
app.get('/api/get-all-data', async (req, res) => {
    try {
        const ranges = [
            `${SHEET_NAMES.REGISTRO}!A:Z`,
            `${SHEET_NAMES.METAS}!A:Z`,
            `${SHEET_NAMES.ORGANIZADORES}!A:Z`,
        ];

        // Lê os valores
        const valuesResponse = await sheets.spreadsheets.values.batchGet({
            spreadsheetId: SPREADSHEET_ID,
            ranges: ranges,
            majorDimension: 'ROWS',
        });

        // Lê os formatos (cores de background) da aba Organizadores
        let organizadoresColors = {};
        try {
            const formatResponse = await sheets.spreadsheets.get({
                spreadsheetId: SPREADSHEET_ID,
                ranges: [`${SHEET_NAMES.ORGANIZADORES}!A1:D1000`],
                includeGridData: true
            });
            
            const sheetData = formatResponse.data.sheets[0];
            if (sheetData && sheetData.data && sheetData.data[0] && sheetData.data[0].rowData) {
                sheetData.data[0].rowData.forEach((row, rowIndex) => {
                    if (rowIndex === 0) return; // Pula o header
                    if (row.values && row.values[3]) { // Coluna D (índice 3)
                        const bgColor = row.values[3].effectiveFormat?.backgroundColor;
                        if (bgColor) {
                            // Converte RGB para hex
                            const r = Math.round((bgColor.red || 0) * 255).toString(16).padStart(2, '0');
                            const g = Math.round((bgColor.green || 0) * 255).toString(16).padStart(2, '0');
                            const b = Math.round((bgColor.blue || 0) * 255).toString(16).padStart(2, '0');
                            const hexColor = `#${r}${g}${b}`;
                            
                            // Associa a cor à tag na mesma linha
                            const tagRow = valuesResponse.data.valueRanges[2].values[rowIndex];
                            if (tagRow && tagRow[0]) {
                                organizadoresColors[tagRow[0]] = hexColor;
                            }
                        }
                    }
                });
            }
        } catch (colorError) {
            console.error('Erro ao ler cores (continuando sem cores):', colorError.message);
            // Continua sem cores se houver erro
        }

        const rawData = {
            registro: mapHeadersToObjects(valuesResponse.data.valueRanges[0].values),
            metas: mapHeadersToObjects(valuesResponse.data.valueRanges[1].values),
            organizadores: mapHeadersToObjects(valuesResponse.data.valueRanges[2].values).map(org => {
                // Adiciona a cor lida do formato da célula ou usa a cor do valor ou padrão
                if (organizadoresColors[org.Tag]) {
                    org.Cor = organizadoresColors[org.Tag];
                } else if (!org.Cor || org.Cor === '') {
                    org.Cor = '#4bc0c0'; // Cor padrão
                }
                return org;
            }),
        };
        
        return res.status(200).json(rawData);

    } catch (error) {
        console.error("Erro ao ler dados da planilha:", error.message);
        return res.status(500).json({ success: false, message: 'Falha ao ler dados da Sheets API.', error: error.message });
    }
});

// 5. ENDPOINT PARA ADICIONAR REGISTRO (POST /api/add-registro)
app.post('/api/add-registro', async (req, res) => {
    const data = req.body; 

    if (!data.Data || !data.Tipo || !data.Valor) {
        return res.status(400).json({ success: false, message: 'Dados incompletos: Data, Tipo ou Valor são obrigatórios.' });
    }
    
    const rowValues = [
        data.Data,                           // Coluna A: Data
        data.Valor,                          // Coluna B: Valor
        data.Tag_1 || '',                    // Coluna C: Tag_1
        data.Tag_2 || '',                    // Coluna D: Tag_2
        data.Tag_3 || '',                    // Coluna E: Tag_3
        data.Tag_4 || '',                    // Coluna F: Tag_4
        data.Descricao || '',                // Coluna G: Descrição
        'Débito',                            // Coluna H: Forma do pagamento (PADRÃO)
        data.Tipo || '',                     // Coluna I: Tipo
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

// 6. ENDPOINT PARA ATUALIZAR REGISTRO (POST /api/update-registro)
app.post('/api/update-registro', async (req, res) => {
    const { ROW_NUMBER, column, value } = req.body;
    
    if (!ROW_NUMBER || !column || value === undefined) {
        return res.status(400).json({ success: false, message: 'Dados incompletos para atualização (ROW_NUMBER, column, ou value ausentes).' });
    }
    
    const targetColLetter = COLUMN_MAP_REGISTRO[column];

    if (!targetColLetter) {
        return res.status(400).json({ success: false, message: `Coluna desconhecida: ${column}.` });
    }

    const range = `${SHEET_NAMES.REGISTRO}!${targetColLetter}${ROW_NUMBER}`; 
    
    const resource = {
        values: [[value]],
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

// 7. ENDPOINT PARA ADICIONAR META (POST /api/add-meta)
app.post('/api/add-meta', async (req, res) => {
    const data = req.body; 

    if (!data.Mes || !data.Tag || data.Meta === undefined) {
        return res.status(400).json({ success: false, message: 'Dados incompletos: Mes, Tag ou Meta são obrigatórios.' });
    }
    
    const rowValues = [
        data.Mes,                            // Coluna A: Mês (MM/AA)
        data.Tag || '',                      // Coluna B: Tag
        data.Meta || '',                     // Coluna C: Meta (Valor)
    ];
    
    const resource = {
        values: [rowValues],
    };

    try {
        const response = await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: `${SHEET_NAMES.METAS}!A:Z`, 
            valueInputOption: 'USER_ENTERED',
            resource,
        });
        
        return res.status(200).json({ success: true, message: 'Meta adicionada com sucesso!', updates: response.data });

    } catch (error) {
        console.error("Erro ao adicionar meta:", error);
        return res.status(500).json({ success: false, message: 'Falha ao adicionar meta na Sheets API.', error: error.message });
    }
});

// 8. ENDPOINT PARA ATUALIZAR META (POST /api/update-meta)
app.post('/api/update-meta', async (req, res) => {
    const { ROW_NUMBER, column, value } = req.body;
    
    if (!ROW_NUMBER || !column || value === undefined) {
        return res.status(400).json({ success: false, message: 'Dados incompletos para atualização (ROW_NUMBER, column, ou value ausentes).' });
    }
    
    const targetColLetter = COLUMN_MAP_METAS[column];

    if (!targetColLetter) {
        return res.status(400).json({ success: false, message: `Coluna desconhecida: ${column}.` });
    }

    const range = `${SHEET_NAMES.METAS}!${targetColLetter}${ROW_NUMBER}`; 
    
    const resource = {
        values: [[value]],
    };

    try {
        const response = await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: range,
            valueInputOption: 'USER_ENTERED',
            resource,
        });

        return res.status(200).json({ success: true, message: `Meta na linha ${ROW_NUMBER} (${column}) atualizada com sucesso!`, updates: response.data });
        
    } catch (error) {
        console.error("Erro ao atualizar meta:", error);
        return res.status(500).json({ success: false, message: 'Falha ao atualizar meta na Sheets API.', error: error.message });
    }
});

// 9. ENDPOINT PARA DELETAR META (POST /api/delete-meta)
app.post('/api/delete-meta', async (req, res) => {
    const { ROW_NUMBER } = req.body;
    
    if (!ROW_NUMBER) {
        return res.status(400).json({ success: false, message: 'ROW_NUMBER é obrigatório.' });
    }

    try {
        const response = await sheets.spreadsheets.batchUpdate({
            spreadsheetId: SPREADSHEET_ID,
            resource: {
                requests: [{
                    deleteDimension: {
                        range: {
                            sheetId: await getSheetId(SHEET_NAMES.METAS),
                            dimension: 'ROWS',
                            startIndex: ROW_NUMBER - 1,
                            endIndex: ROW_NUMBER
                        }
                    }
                }]
            }
        });

        return res.status(200).json({ success: true, message: `Meta na linha ${ROW_NUMBER} deletada com sucesso!`, updates: response.data });
        
    } catch (error) {
        console.error("Erro ao deletar meta:", error);
        return res.status(500).json({ success: false, message: 'Falha ao deletar meta na Sheets API.', error: error.message });
    }
});

// 10. ENDPOINT PARA ADICIONAR ORGANIZADOR/TAG (POST /api/add-organizador)
app.post('/api/add-organizador', async (req, res) => {
    const data = req.body; 

    if (!data.Tag) {
        return res.status(400).json({ success: false, message: 'Tag é obrigatória.' });
    }
    
    const rowValues = [
        data.Tag || '',                      // Coluna A: Tag
        data['Forma do pagamento'] || '',    // Coluna B: Forma do pagamento
        data.Tipo || '',                     // Coluna C: Tipo
        data.Cor || '#4bc0c0',               // Coluna D: Cor (padrão azul)
    ];
    
    const resource = {
        values: [rowValues],
    };

    try {
        const response = await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: `${SHEET_NAMES.ORGANIZADORES}!A:Z`, 
            valueInputOption: 'USER_ENTERED',
            resource,
        });

        // Atualiza a cor de fundo da célula se fornecida
        if (data.Cor) {
            const newRowNumber = response.data.updates.updatedRange ? 
                parseInt(response.data.updates.updatedRange.match(/\d+/)[0]) : null;
            if (newRowNumber) {
                await updateCellBackground(SHEET_NAMES.ORGANIZADORES, `D${newRowNumber}`, data.Cor);
            }
        }
        
        return res.status(200).json({ success: true, message: 'Tag adicionada com sucesso!', updates: response.data });

    } catch (error) {
        console.error("Erro ao adicionar organizador:", error);
        return res.status(500).json({ success: false, message: 'Falha ao adicionar tag na Sheets API.', error: error.message });
    }
});

// 11. ENDPOINT PARA ATUALIZAR ORGANIZADOR/TAG (POST /api/update-organizador)
app.post('/api/update-organizador', async (req, res) => {
    const { ROW_NUMBER, column, value } = req.body;
    
    if (!ROW_NUMBER || !column || value === undefined) {
        return res.status(400).json({ success: false, message: 'Dados incompletos para atualização (ROW_NUMBER, column, ou value ausentes).' });
    }
    
    const targetColLetter = COLUMN_MAP_ORGANIZADORES[column];

    if (!targetColLetter) {
        return res.status(400).json({ success: false, message: `Coluna desconhecida: ${column}.` });
    }

    const range = `${SHEET_NAMES.ORGANIZADORES}!${targetColLetter}${ROW_NUMBER}`; 
    
    const resource = {
        values: [[value]],
    };

    try {
        const response = await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: range,
            valueInputOption: 'USER_ENTERED',
            resource,
        });

        // Se a coluna atualizada for 'Cor', atualiza também o background da célula
        if (column === 'Cor' && value) {
            await updateCellBackground(SHEET_NAMES.ORGANIZADORES, `${targetColLetter}${ROW_NUMBER}`, value);
        }

        return res.status(200).json({ success: true, message: `Tag na linha ${ROW_NUMBER} (${column}) atualizada com sucesso!`, updates: response.data });
        
    } catch (error) {
        console.error("Erro ao atualizar organizador:", error);
        return res.status(500).json({ success: false, message: 'Falha ao atualizar tag na Sheets API.', error: error.message });
    }
});

// 12. ENDPOINT PARA DELETAR ORGANIZADOR/TAG (POST /api/delete-organizador)
app.post('/api/delete-organizador', async (req, res) => {
    const { ROW_NUMBER } = req.body;
    
    if (!ROW_NUMBER) {
        return res.status(400).json({ success: false, message: 'ROW_NUMBER é obrigatório.' });
    }

    try {
        const response = await sheets.spreadsheets.batchUpdate({
            spreadsheetId: SPREADSHEET_ID,
            resource: {
                requests: [{
                    deleteDimension: {
                        range: {
                            sheetId: await getSheetId(SHEET_NAMES.ORGANIZADORES),
                            dimension: 'ROWS',
                            startIndex: ROW_NUMBER - 1,
                            endIndex: ROW_NUMBER
                        }
                    }
                }]
            }
        });

        return res.status(200).json({ success: true, message: `Tag na linha ${ROW_NUMBER} deletada com sucesso!`, updates: response.data });
        
    } catch (error) {
        console.error("Erro ao deletar organizador:", error);
        return res.status(500).json({ success: false, message: 'Falha ao deletar tag na Sheets API.', error: error.message });
    }
});

// 13. INICIA O SERVIDOR
authenticateSheet().then(() => {
  app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
    console.log(`Endpoint de leitura: /api/get-all-data`);
    console.log(`Endpoint de escrita Registro: /api/add-registro`);
    console.log(`Endpoint de atualização Registro: /api/update-registro`);
    console.log(`Endpoint de escrita Meta: /api/add-meta`);
    console.log(`Endpoint de atualização Meta: /api/update-meta`);
    console.log(`Endpoint de deleção Meta: /api/delete-meta`);
    console.log(`Endpoint de escrita Tag: /api/add-organizador`);
    console.log(`Endpoint de atualização Tag: /api/update-organizador`);
    console.log(`Endpoint de deleção Tag: /api/delete-organizador`);
  });
}).catch((error) => {
    console.error(`Servidor não iniciado devido a falha crítica na autenticação: ${error.message}`);
});
