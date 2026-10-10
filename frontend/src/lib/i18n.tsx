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
    account: "Compte", deleteAccount: "Supprimer mon compte",
    deleteAccountTitle: "Supprimer votre compte", deleteAccountIrreversible: "Cette action est définitive et irréversible.",
    deleteAccountWhat: "Les éléments suivants seront supprimés immédiatement de nos serveurs :",
    deleteItemAccount: "Votre compte et votre adresse e-mail", deleteItemVault: "Votre coffre chiffré et tous vos mots de passe",
    deleteItemFiles: "Vos pièces jointes chiffrées", deleteItemSessions: "Toutes vos sessions actives sur tous vos appareils",
    deleteAccountNoRecovery: "Aucune récupération n’est possible après la suppression. Exportez votre coffre au préalable si vous souhaitez le conserver.",
    typeEmailToConfirm: "Saisissez votre adresse e-mail pour confirmer", enterAccountPassword: "Saisissez le mot de passe de votre compte",
    deletePermanently: "Supprimer définitivement", deleting: "Suppression…", cancel: "Annuler",
    emailMismatch: "L’adresse e-mail ne correspond pas", accountDeleted: "Compte supprimé",
    accountDeletedMsg: "Votre compte et toutes vos données ont été supprimés.",
    exportVault: "Exporter mon coffre", exportVaultHint: "Copie votre coffre chiffré dans le presse-papiers. Collez-le dans un endroit sûr : il restera illisible sans votre mot de passe maître.",
    exportCopied: "Coffre chiffré copié", exportCopiedMsg: "Votre coffre chiffré est dans le presse-papiers. Collez-le dans un fichier ou une note sécurisée avant de continuer.",
    exportNeedsUnlock: "Déverrouillez d’abord votre coffre pour pouvoir l’exporter.", decrypting: "Déchiffrement du coffre…",
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
    account: "Account", deleteAccount: "Delete my account",
    deleteAccountTitle: "Delete your account", deleteAccountIrreversible: "This action is permanent and cannot be undone.",
    deleteAccountWhat: "The following will be deleted immediately from our servers:",
    deleteItemAccount: "Your account and e-mail address", deleteItemVault: "Your encrypted vault and all your passwords",
    deleteItemFiles: "Your encrypted attachments", deleteItemSessions: "All active sessions on all your devices",
    deleteAccountNoRecovery: "No recovery is possible after deletion. Export your vault first if you want to keep it.",
    typeEmailToConfirm: "Type your e-mail address to confirm", enterAccountPassword: "Enter your account password",
    deletePermanently: "Delete permanently", deleting: "Deleting…", cancel: "Cancel",
    emailMismatch: "E-mail address does not match", accountDeleted: "Account deleted",
    accountDeletedMsg: "Your account and all your data have been deleted.",
    exportVault: "Export my vault", exportVaultHint: "Copies your encrypted vault to the clipboard. Paste it somewhere safe: it stays unreadable without your master password.",
    exportCopied: "Encrypted vault copied", exportCopiedMsg: "Your encrypted vault is in the clipboard. Paste it into a file or secure note before continuing.",
    exportNeedsUnlock: "Unlock your vault first to export it.", decrypting: "Decrypting vault…",
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
    account: "Cuenta", deleteAccount: "Eliminar mi cuenta",
    deleteAccountTitle: "Eliminar tu cuenta", deleteAccountIrreversible: "Esta acción es permanente e irreversible.",
    deleteAccountWhat: "Lo siguiente se eliminará inmediatamente de nuestros servidores:",
    deleteItemAccount: "Tu cuenta y tu dirección de correo", deleteItemVault: "Tu bóveda cifrada y todas tus contraseñas",
    deleteItemFiles: "Tus archivos adjuntos cifrados", deleteItemSessions: "Todas las sesiones activas en todos tus dispositivos",
    deleteAccountNoRecovery: "No es posible recuperar nada tras la eliminación. Exporta tu bóveda antes si quieres conservarla.",
    typeEmailToConfirm: "Escribe tu correo electrónico para confirmar", enterAccountPassword: "Introduce la contraseña de tu cuenta",
    deletePermanently: "Eliminar definitivamente", deleting: "Eliminando…", cancel: "Cancelar",
    emailMismatch: "El correo electrónico no coincide", accountDeleted: "Cuenta eliminada",
    accountDeletedMsg: "Tu cuenta y todos tus datos han sido eliminados.",
    exportVault: "Exportar mi bóveda", exportVaultHint: "Copia tu bóveda cifrada al portapapeles. Pégala en un lugar seguro: seguirá siendo ilegible sin tu contraseña maestra.",
    exportCopied: "Bóveda cifrada copiada", exportCopiedMsg: "Tu bóveda cifrada está en el portapapeles. Pégala en un archivo o nota segura antes de continuar.",
    exportNeedsUnlock: "Desbloquea primero tu bóveda para exportarla.", decrypting: "Descifrando la bóveda…",
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