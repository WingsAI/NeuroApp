'use client'

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { ShieldCheck, Activity, Loader2, UserPlus } from 'lucide-react';

export default function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [isSignUp, setIsSignUp] = useState(false);
    const router = useRouter();

    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            if (isSignUp) {
                const { error: signUpError } = await supabase.auth.signUp({
                    email,
                    password,
                    options: {
                        emailRedirectTo: `${window.location.origin}/auth/callback`,
                    },
                });
                if (signUpError) throw signUpError;
                setError('Cadastro realizado! Se o auto-cadastro estiver habilitado no Supabase, verifique seu email.');
            } else {
                const { error: signInError } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                });
                if (signInError) throw signInError;
                router.push('/');
                router.refresh();
            }
        } catch (err: any) {
            setError(err.message || 'Erro na autenticação.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-sandstone-50 flex flex-col justify-center relative overflow-hidden">
            <div className="noise-overlay" />

            <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
                <div className="flex justify-center mb-8">
                    <div className="bg-cardinal-700 p-3 rounded-2xl shadow-xl">
                        <Activity className="h-10 w-10 text-white" />
                    </div>
                </div>
                <h2 className="text-center text-4xl font-serif font-bold text-charcoal">
                    Neuro<span className="text-cardinal-700">App</span>
                </h2>
                <p className="mt-2 text-center text-sm font-medium text-sandstone-500 uppercase tracking-widest">
                    {isSignUp ? 'Solicitar Acesso ao Sistema' : 'Acesso Restrito a Especialistas'}
                </p>
            </div>

            <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10 text-center mb-6">
                <div className="inline-flex p-1 bg-sandstone-100 rounded-xl">
                    <button
                        onClick={() => { setIsSignUp(false); setError(''); }}
                        className={`px-6 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${!isSignUp ? 'bg-white text-cardinal-700 shadow-sm' : 'text-sandstone-500'}`}
                    >
                        Entrar
                    </button>
                    <button
                        onClick={() => { setIsSignUp(true); setError(''); }}
                        className={`px-6 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${isSignUp ? 'bg-white text-cardinal-700 shadow-sm' : 'text-sandstone-500'}`}
                    >
                        Cadastrar
                    </button>
                </div>
            </div>

            <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
                <div className="premium-card bg-white py-10 px-8">
                    <form className="space-y-6" onSubmit={handleAuth}>
                        <div>
                            <label className="block text-xs font-bold text-sandstone-500 uppercase tracking-wider mb-2">
                                Identificador / Email
                            </label>
                            <input
                                type="email"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="input-premium"
                                placeholder="clinico@neuroapp.com"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-sandstone-500 uppercase tracking-wider mb-2">
                                Chave de Acesso
                            </label>
                            <input
                                type="password"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="input-premium"
                                placeholder="••••••••"
                            />
                        </div>

                        {error && (
                            <div className="p-4 bg-cardinal-50 border border-cardinal-100 rounded-xl flex items-center space-x-3">
                                <div className="h-2 w-2 rounded-full bg-cardinal-700 animate-pulse" />
                                <p className="text-xs font-bold text-cardinal-800 uppercase tracking-widest">{error}</p>
                            </div>
                        )}

                        <div>
                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full btn-cardinal py-4 text-sm uppercase tracking-widest font-bold flex items-center justify-center space-x-3"
                            >
                                {loading ? <Loader2 className="animate-spin w-5 h-5" /> : (
                                    <>
                                        {isSignUp ? <UserPlus className="w-5 h-5" /> : <ShieldCheck className="w-5 h-5" />}
                                        <span>{isSignUp ? 'Criar Conta' : 'Autenticar Usuário'}</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </form>

                    <div className="mt-8 pt-8 border-t border-sandstone-100 text-center">
                        <p className="text-[10px] text-sandstone-400 font-bold uppercase tracking-[0.2em] leading-relaxed">
                            Este sistema armazena dados protegidos por sigilo médico.<br />
                            O acesso não autorizado é passível de sanções legais.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
