import { createClient } from '@/lib/supabase-server';

/**
 * Garante que há um usuário autenticado. Usa getUser() (valida o token no
 * servidor Supabase) em vez de getSession() para checagens server-side seguras.
 * Lança 'Não autorizado' se não houver usuário válido.
 */
export async function requireAuth() {
    const supabase = createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
        throw new Error('Não autorizado');
    }
    return user;
}
