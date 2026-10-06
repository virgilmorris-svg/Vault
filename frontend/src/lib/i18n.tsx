import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { secure } from "./storage";

export type Language = "fr" | "en" | "es";

const translations = {
  fr: {
    signIn: "Se connecter", createAccount: "Créer un compte", email: "E-mail",
    accountPassword: "Mot de passe du compte", masterPassword: "Mot de passe maître",
    confirmMaster: "Confirmer le mot de passe maître", signInWithGoogle: "Continuer avec Google",
    createVault: "Créer un coffre sécurisé", vaultLocked: "Coffre verrouillé", unlock: "Déverrouiller",
    unlockBiometric: "Déverrouiller avec la biométrie", signOut: "Se déconnecter",
    differentAccount: "Utiliser un autre compte ou en créer un nouveau", language: "Langue",
    french: "Français", english: "Anglais", spanish: "Espagnol", security: "Sécurité",
    settings: "Réglages", vault: "Coffre", generator: "Générateur", securityTab: "Sécurité",
    zeroKnowledge: "Coffre de mots de passe sans connaissance", fillFields: "Remplissez tous les champs",
    wrongMaster: "Mot de passe maître incorrect", masterMin: "Le mot de passe maître doit contenir au moins 12 caractères",
    masterMismatch: "Les mots de passe maîtres ne correspondent pas", repeatMaster: "Répétez le mot de passe maître",
    masterLocal: "Votre mot de passe maître ne quitte jamais cet appareil. Il est impossible de le récupérer s’il est perdu.",
    atLeast8: "Au moins 8 caractères", masterEncrypt: "12 caractères ou plus, utilisé pour chiffrer votre coffre",
    immediately: "Immédiatement", minute: "minute", minutes: "minutes", lockNow: "Verrouiller maintenant", autoLock: "Verrouillage automatique",
    biometric: "Déverrouillage biométrique", enable: "Activer la biométrie", disable: "Désactiver",
  },
  en: {
    signIn: "Sign in", createAccount: "Create account", email: "Email", accountPassword: "Account password",
    masterPassword: "Master password", confirmMaster: "Confirm master password", signInWithGoogle: "Continue with Google",
    createVault: "Create secure vault", vaultLocked: "Vault locked", unlock: "Unlock", unlockBiometric: "Unlock with biometrics",
    signOut: "Sign out", differentAccount: "Use a different account or create a new one", language: "Language",
    french: "French", english: "English", spanish: "Spanish", security: "Security", settings: "Settings", vault: "Vault",
    generator: "Generator", securityTab: "Security", zeroKnowledge: "Zero-knowledge password vault", fillFields: "Fill in all fields",
    wrongMaster: "Wrong master password", masterMin: "Master password must be at least 12 characters",
    masterMismatch: "Master passwords do not match", repeatMaster: "Repeat master password",
    masterLocal: "Your master password never leaves this device. It cannot be recovered if lost.",
    atLeast8: "At least 8 characters", masterEncrypt: "12+ characters, used to encrypt your vault",
    immediately: "Immediately", minute: "minute", minutes: "minutes", lockNow: "Lock now", autoLock: "Auto-lock", biometric: "Biometric unlock",
    enable: "Enable biometric unlock", disable: "Disable",
  },
  es: {
    signIn: "Iniciar sesión", createAccount: "Crear cuenta", email: "Correo electrónico", accountPassword: "Contraseña de la cuenta",
    masterPassword: "Contraseña maestra", confirmMaster: "Confirmar contraseña maestra", signInWithGoogle: "Continuar con Google",
    createVault: "Crear bóveda segura", vaultLocked: "Bóveda bloqueada", unlock: "Desbloquear", unlockBiometric: "Desbloquear con biometría",
    signOut: "Cerrar sesión", differentAccount: "Usar otra cuenta o crear una nueva", language: "Idioma", french: "Francés",
    english: "Inglés", spanish: "Español", security: "Seguridad", settings: "Ajustes", vault: "Bóveda", generator: "Generador",
    securityTab: "Seguridad", zeroKnowledge: "Bóveda de contraseñas sin conocimiento", fillFields: "Completa todos los campos",
    wrongMaster: "Contraseña maestra incorrecta", masterMin: "La contraseña maestra debe tener al menos 12 caracteres",
    masterMismatch: "Las contraseñas maestras no coinciden", repeatMaster: "Repite la contraseña maestra",
    masterLocal: "Tu contraseña maestra nunca sale de este dispositivo. No se puede recuperar si la pierdes.",
    atLeast8: "Al menos 8 caracteres", masterEncrypt: "12 caracteres o más, para cifrar tu bóveda", immediately: "Inmediatamente",
    minute: "minuto", minutes: "minutos", lockNow: "Bloquear ahora", autoLock: "Bloqueo automático", biometric: "Desbloqueo biométrico",
    enable: "Activar biometría", disable: "Desactivar",
  },
} as const;

type TranslationKey = keyof typeof translations.fr;
type I18nValue = { language: Language; setLanguage: (language: Language) => void; t: (key: TranslationKey) => string };
const LanguageContext = createContext<I18nValue | null>(null);
const LANGUAGE_KEY = "sp_language";

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>("fr");
  useEffect(() => { secure.get(LANGUAGE_KEY).then((value) => { if (value === "fr" || value === "en" || value === "es") setLanguageState(value); }); }, []);
  const setLanguage = (value: Language) => { setLanguageState(value); void secure.set(LANGUAGE_KEY, value); };
  const value = useMemo(() => ({ language, setLanguage, t: (key: TranslationKey) => translations[language][key] }), [language]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const value = useContext(LanguageContext);
  if (!value) throw new Error("useLanguage must be used inside LanguageProvider");
  return value;
}