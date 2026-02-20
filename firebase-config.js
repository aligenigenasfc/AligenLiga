// ═══════════════════════════════════════════════════════
//  AlienígenasFC — Firebase Configuration
// ═══════════════════════════════════════════════════════
//
//  ╔══════════════════════════════════════════════════╗
//  ║         COMO CONFIGURAR O FIREBASE               ║
//  ╠══════════════════════════════════════════════════╣
//  ║                                                  ║
//  ║  1. Acesse: https://console.firebase.google.com  ║
//  ║  2. Clique em "Adicionar projeto"                ║
//  ║  3. Dê o nome "AlienigenasFC" e crie             ║
//  ║  4. No painel, clique no ícone </> (Web)         ║
//  ║  5. Registre o app com nome "AlienigenasFC"      ║
//  ║  6. Copie o objeto firebaseConfig gerado         ║
//  ║  7. Cole aqui embaixo substituindo os valores    ║
//  ║                                                  ║
//  ║  ATIVAR AUTENTICAÇÃO:                            ║
//  ║  • Vá em Authentication > Sign-in method         ║
//  ║  • Ative "E-mail/senha"                          ║
//  ║                                                  ║
//  ║  CRIAR FIRESTORE:                                ║
//  ║  • Vá em Firestore Database                      ║
//  ║  • Clique "Criar banco de dados"                 ║
//  ║  • Escolha a região (southamerica-east1)         ║
//  ║  • Inicie em "modo de teste" (depois ajuste)     ║
//  ║  • Após criar, vá em "Regras" e cole as regras  ║
//  ║    do arquivo firestore.rules                    ║
//  ║                                                  ║
//  ║  DEPLOY NO GITHUB PAGES:                         ║
//  ║  • Crie um repo no GitHub                        ║
//  ║  • Faça push de todos os arquivos                ║
//  ║  • Vá em Settings > Pages                        ║
//  ║  • Source: Deploy from branch                    ║
//  ║  • Branch: main, / (root)                        ║
//  ║  • O app estará em:                              ║
//  ║    https://SEU_USER.github.io/NOME_DO_REPO/     ║
//  ║                                                  ║
//  ╚══════════════════════════════════════════════════╝
//

const firebaseConfig = {
    apiKey: "AIzaSyB7OVWdD7Rgw8AqWFKy2_xv7P9zbhLRd5E",
    authDomain: "aligenigenasfc-aligen-liga.firebaseapp.com",
    projectId: "aligenigenasfc-aligen-liga",
    storageBucket: "aligenigenasfc-aligen-liga.firebasestorage.app",
    messagingSenderId: "114740949394",
    appId: "1:114740949394:web:ea1124f2a558b5cf38114b"
};

// ═══════════════════════════════════════════════════════
//  Inicialização do Firebase
// ═══════════════════════════════════════════════════════

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();

// Habilitar persistência offline do Firestore
// Isso permite que o app funcione sem internet
db.enablePersistence({ synchronizeTabs: true }).catch(err => {
    if (err.code === 'failed-precondition') {
        console.warn('Firestore: múltiplas abas abertas, persistência offline limitada a uma aba.');
    } else if (err.code === 'unimplemented') {
        console.warn('Firestore: persistência offline não suportada neste navegador.');
    }
});

// Configurar idioma do Firebase Auth para português
auth.languageCode = 'pt';

// Google Auth Provider
const googleProvider = new firebase.auth.GoogleAuthProvider();
