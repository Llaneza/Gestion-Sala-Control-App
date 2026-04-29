import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

// Configuración centralizada de Firebase.
// No modificar salvo cambio real de proyecto Firebase.
const firebaseConfig = {
  apiKey: "AIzaSyAAW-KbrhHIzDyRTgmVjlzPa7TK8o9FeI4",
  authDomain: "app-sala-control.firebaseapp.com",
  projectId: "app-sala-control",
  storageBucket: "app-sala-control.firebasestorage.app",
  messagingSenderId: "622611612673",
  appId: "1:622611612673:web:4200dcddc50292908c2c00"
};

const app = initializeApp(firebaseConfig);

export const db = getDatabase(app);
