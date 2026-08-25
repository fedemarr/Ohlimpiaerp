// FinFlow — Abrir un archivo PRIVADO de finflow-docs en una pestana nueva.
//
// Extraida de precios.js (verDocParitaria), donde nacio para los documentos de
// paritaria. Se comparte al necesitarla tambien la columna Nota de la grilla de
// Precios y el CRM: los tres abren un archivo del mismo bucket, que es PRIVADO.
//
// POR QUE UNA URL FIRMADA Y NO UN LINK DIRECTO
// El bucket no es publico: una direccion suelta no abre nada. createSignedUrl
// devuelve una que vale 60 segundos y despues muere. Alcanza de sobra para abrir
// la pestana, y no deja un link permanente dando vueltas en el historial del
// navegador ni en un mail reenviado.
//
// LA DIFERENCIA ENTRE "NO HAY ARCHIVO" Y "NO SE PUDO ABRIR"
// Sin path no pasa nada y no se avisa nada: es el caso normal de una nota vieja,
// generada antes de que el sistema guardara los PDF. No hay nada que abrir y no
// hay error que informar.
// Con path pero sin poder abrirlo (el archivo se borro, se cayo la red, falta
// permiso) SI hay un problema real, y para eso esta onError: si no se avisara,
// el clic no haria nada y la pantalla pareceria rota.
export async function abrirDocStorage(supabase, path, onError) {
  if (!path) return false;
  try {
    const { data, error } = await supabase.storage.from("finflow-docs").createSignedUrl(path, 60);
    if (error) throw error;
    window.open(data.signedUrl, "_blank");
    return true;
  } catch (err) {
    onError?.(err);
    return false;
  }
}
