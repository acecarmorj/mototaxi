/** Substitui window.storage (API do protótipo) com localStorage do navegador. */
export const sharedStorage = {
  async get(key) {
    try {
      const value = localStorage.getItem(key);
      return value != null ? { value } : null;
    } catch {
      return null;
    }
  },
  async set(key, value) {
    try {
      localStorage.setItem(key, value);
      window.dispatchEvent(new CustomEvent("carmoto-storage", { detail: { key, value } }));
    } catch {
      // quota ou modo privado
    }
  },
};
