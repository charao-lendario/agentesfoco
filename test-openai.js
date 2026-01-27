import OpenAI from 'openai';
// Simulação de carregamento de .env manual já que não temos dotenv instalado e não quero instalar de novo
// Vou ler o arquivo .env e pegar a chave na marra

import fs from 'fs';
import path from 'path';

const envPath = path.resolve(process.cwd(), '.env');
let apiKey = '';

try {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    const match = envContent.match(/OPENAI_API_KEY=(.+)/);
    if (match && match[1]) {
        apiKey = match[1].trim();
    }
} catch (e) {
    console.error("Erro ao ler arquivo .env:", e.message);
}

console.log("Tentando usar chave final:", apiKey ? apiKey.substring(0, 10) + '...' : 'NENHUMA');

if (!apiKey) {
    console.error("ABORTANDO: Chave não encontrada.");
    process.exit(1);
}

const openai = new OpenAI({ apiKey });

async function test() {
    console.log("Iniciando teste de conexão com OpenAI...");
    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: "Responda apenas com a palavra: SUCESSO" }],
        });
        console.log("RESPOSTA DA API:", completion.choices[0].message.content);
    } catch (error) {
        console.error("ERRO FATAL NA API:", error);
    }
}

test();
