'use client';

import React, { useEffect, useState } from 'react';
import { Plus, Search, MapPin, Phone, Mail, User, MoreVertical, Edit2, Trash2, X, Building2, LayoutGrid, List as ListIcon } from 'lucide-react';
import Navbar from '@/components/Navbar';
import { getHealthUnitsAction, createHealthUnitAction, updateHealthUnitAction, deleteHealthUnitAction } from '@/app/actions/units';
import { HealthUnit } from '@/types';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';

export default function Units() {
    const [units, setUnits] = useState<HealthUnit[]>([]);
    const [filteredUnits, setFilteredUnits] = useState<HealthUnit[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [showModal, setShowModal] = useState(false);
    const [editingUnit, setEditingUnit] = useState<HealthUnit | null>(null);
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    const [formData, setFormData] = useState({
        name: '',
        address: '',
        email: '',
        phone: '',
        responsible: '',
    });

    useEffect(() => {
        const checkUser = async () => {
            const supabase = createClient();
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                router.push('/login');
            } else {
                loadUnits();
            }
        };
        checkUser();
    }, [router]);

    useEffect(() => {
        const term = searchTerm.toLowerCase();
        const filtered = units.filter(
            u => u.name.toLowerCase().includes(term) ||
                u.responsible.toLowerCase().includes(term) ||
                u.address.toLowerCase().includes(term)
        );
        setFilteredUnits(filtered);
    }, [searchTerm, units]);

    const loadUnits = async () => {
        const allUnits = await getHealthUnitsAction();
        setUnits(allUnits);
    };

    const handleOpenModal = (unit: HealthUnit | null = null) => {
        if (unit) {
            setEditingUnit(unit);
            setFormData({
                name: unit.name,
                address: unit.address,
                email: unit.email,
                phone: unit.phone,
                responsible: unit.responsible,
            });
        } else {
            setEditingUnit(null);
            setFormData({
                name: '',
                address: '',
                email: '',
                phone: '',
                responsible: '',
            });
        }
        setShowModal(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        if (editingUnit) {
            const result = await updateHealthUnitAction(editingUnit.id, formData);
            if (result.success) {
                setShowModal(false);
                loadUnits();
            }
        } else {
            const result = await createHealthUnitAction(formData);
            if (result.success) {
                setShowModal(false);
                setFormData({ name: '', address: '', email: '', phone: '', responsible: '' });
                loadUnits();
            }
        }
        setLoading(false);
    };

    const handleDelete = async (id: string) => {
        if (confirm('Tem certeza que deseja excluir esta unidade?')) {
            const result = await deleteHealthUnitAction(id);
            if (result.success) {
                loadUnits();
            }
        }
    };

    return (
        <div className="min-h-screen relative overflow-hidden">
            <div className="noise-overlay" />
            <Navbar />

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-20">
                <div className="stagger-load space-y-12">
                    {/* Header Section */}
                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-8">
                        <div className="max-w-2xl">
                            <div className="accent-line" />
                            <h1 className="text-4xl md:text-5xl font-serif font-bold text-charcoal mb-6 leading-[1.1]">
                                Gestão de <span className="text-cardinal-700 italic">Unidades</span>
                            </h1>
                            <p className="text-lg text-sandstone-600 font-medium">
                                Cadastre e gerencie as unidades de saúde integradas ao ecossistema NeuroApp.
                            </p>
                        </div>

                        <button
                            onClick={() => handleOpenModal()}
                            className="btn-cardinal flex items-center space-x-3 px-8 py-4 shadow-xl shadow-cardinal-200"
                        >
                            <Plus className="w-5 h-5" />
                            <span className="uppercase tracking-[0.2em] text-xs font-bold">Nova Unidade</span>
                        </button>
                    </div>

                    {/* Controls Bar */}
                    <div className="flex flex-col md:flex-row gap-6 items-center justify-between bg-white p-4 rounded-2xl shadow-sm border border-sandstone-100">
                        <div className="relative w-full md:max-w-md group">
                            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-sandstone-400 group-focus-within:text-cardinal-700 transition-colors" />
                            <input
                                type="text"
                                placeholder="Buscar por nome, responsável ou endereço..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="input-premium pl-12 h-12 text-sm"
                            />
                        </div>

                        <div className="flex items-center gap-2 p-1 bg-sandstone-50 rounded-xl border border-sandstone-100">
                            <button
                                onClick={() => setViewMode('grid')}
                                className={`p-2 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-white text-cardinal-700 shadow-sm' : 'text-sandstone-400'}`}
                            >
                                <LayoutGrid className="w-5 h-5" />
                            </button>
                            <button
                                onClick={() => setViewMode('list')}
                                className={`p-2 rounded-lg transition-all ${viewMode === 'list' ? 'bg-white text-cardinal-700 shadow-sm' : 'text-sandstone-400'}`}
                            >
                                <ListIcon className="w-5 h-5" />
                            </button>
                        </div>
                    </div>

                    {/* Units Display */}
                    {filteredUnits.length === 0 ? (
                        <div className="premium-card p-20 text-center bg-sandstone-50/30">
                            <Building2 className="mx-auto h-16 w-16 text-sandstone-200" />
                            <h3 className="text-2xl font-serif font-bold text-charcoal mt-6 mb-2">Nenhuma unidade cadastrada</h3>
                            <p className="text-sandstone-600 font-medium max-w-md mx-auto">
                                Comece adicionando uma nova unidade de saúde para gerenciar seus respectivos laudos e demandas.
                            </p>
                        </div>
                    ) : viewMode === 'grid' ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                            {filteredUnits.map((unit) => (
                                <div key={unit.id} className="premium-card group hover:scale-[1.02] transition-all duration-500 overflow-hidden flex flex-col">
                                    <div className="p-8 space-y-6 flex-1">
                                        <div className="flex justify-between items-start">
                                            <div className="w-12 h-12 bg-cardinal-50 rounded-2xl flex items-center justify-center text-cardinal-700 group-hover:bg-cardinal-700 group-hover:text-white transition-colors duration-500">
                                                <Building2 className="w-6 h-6" />
                                            </div>
                                            <div className="flex space-x-1">
                                                <button onClick={() => handleOpenModal(unit)} className="p-2 text-sandstone-400 hover:text-cardinal-700 hover:bg-cardinal-50 rounded-lg transition-all">
                                                    <Edit2 className="w-4 h-4" />
                                                </button>
                                                <button onClick={() => handleDelete(unit.id)} className="p-2 text-sandstone-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all">
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>

                                        <div>
                                            <h3 className="text-xl font-serif font-bold text-charcoal leading-tight mb-2 group-hover:text-cardinal-700 transition-colors">{unit.name}</h3>
                                            <div className="flex items-start text-xs text-sandstone-500 font-medium">
                                                <MapPin className="w-3 h-3 mr-2 mt-0.5 flex-shrink-0" />
                                                <span>{unit.address}</span>
                                            </div>
                                        </div>

                                        <div className="pt-6 border-t border-sandstone-100 space-y-3">
                                            <div className="flex items-center text-xs">
                                                <User className="w-3.5 h-3.5 mr-3 text-sandstone-400" />
                                                <span className="font-bold text-charcoal">{unit.responsible}</span>
                                            </div>
                                            <div className="flex items-center text-xs">
                                                <Phone className="w-3.5 h-3.5 mr-3 text-sandstone-400" />
                                                <span className="text-sandstone-600 font-medium">{unit.phone}</span>
                                            </div>
                                            <div className="flex items-center text-xs">
                                                <Mail className="w-3.5 h-3.5 mr-3 text-sandstone-400" />
                                                <span className="text-sandstone-600 font-medium">{unit.email}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="h-1 bg-cardinal-100 group-hover:bg-cardinal-700 transition-colors duration-500" />
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="premium-card overflow-hidden">
                            <table className="min-w-full">
                                <thead>
                                    <tr className="bg-sandstone-50/50">
                                        <th className="px-8 py-5 text-left text-xs font-bold text-sandstone-500 uppercase tracking-widest border-b border-sandstone-100">Unidade</th>
                                        <th className="px-8 py-5 text-left text-xs font-bold text-sandstone-500 uppercase tracking-widest border-b border-sandstone-100">Responsável</th>
                                        <th className="px-8 py-5 text-left text-xs font-bold text-sandstone-500 uppercase tracking-widest border-b border-sandstone-100">Contato</th>
                                        <th className="px-8 py-5 text-right text-xs font-bold text-sandstone-500 uppercase tracking-widest border-b border-sandstone-100">Ações</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-sandstone-100">
                                    {filteredUnits.map((unit) => (
                                        <tr key={unit.id} className="hover:bg-cardinal-50/30 transition-colors">
                                            <td className="px-8 py-6">
                                                <div className="font-serif font-bold text-charcoal">{unit.name}</div>
                                                <div className="text-[10px] text-sandstone-400 mt-1 uppercase tracking-widest truncate max-w-xs">{unit.address}</div>
                                            </td>
                                            <td className="px-8 py-6">
                                                <div className="text-sm font-bold text-charcoal">{unit.responsible}</div>
                                            </td>
                                            <td className="px-8 py-6">
                                                <div className="text-xs text-sandstone-600 font-medium group">{unit.email}</div>
                                                <div className="text-xs text-sandstone-400 mt-1">{unit.phone}</div>
                                            </td>
                                            <td className="px-8 py-6 text-right">
                                                <div className="flex justify-end space-x-2">
                                                    <button onClick={() => handleOpenModal(unit)} className="p-2 text-sandstone-400 hover:text-cardinal-700 transition-all">
                                                        <Edit2 className="w-4 h-4" />
                                                    </button>
                                                    <button onClick={() => handleDelete(unit.id)} className="p-2 text-sandstone-400 hover:text-red-600 transition-all">
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </main>

            {/* Modal Section */}
            {showModal && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-charcoal/40 backdrop-blur-sm animate-in fade-in" onClick={() => setShowModal(false)} />

                    <div className="relative bg-white w-full max-w-xl rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in duration-300">
                        <div className="px-8 py-6 bg-sandstone-50 border-b border-sandstone-100 flex items-center justify-between">
                            <div className="flex items-center space-x-4">
                                <div className="p-3 bg-cardinal-700 rounded-xl text-white shadow-lg">
                                    {editingUnit ? <Edit2 className="h-6 w-6" /> : <Plus className="h-6 w-6" />}
                                </div>
                                <div>
                                    <h2 className="text-2xl font-serif font-bold text-charcoal">
                                        {editingUnit ? 'Editar Unidade' : 'Cadastrar Unidade'}
                                    </h2>
                                    <p className="text-sm text-sandstone-500 font-medium">Insira as informações básicas da organização.</p>
                                </div>
                            </div>
                            <button onClick={() => setShowModal(false)} className="p-2 text-sandstone-400 hover:text-charcoal transition-all">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-10 space-y-6">
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold uppercase tracking-widest text-sandstone-400 ml-1">Nome da Unidade / Health Center</label>
                                <input
                                    type="text"
                                    required
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    placeholder="Ex: UPA Central, Unidade Básica Sul..."
                                    className="input-premium h-12"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-bold uppercase tracking-widest text-sandstone-400 ml-1">Endereço Completo</label>
                                <input
                                    type="text"
                                    required
                                    value={formData.address}
                                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                                    placeholder="Rua, Número, Bairro, Cidade - UF"
                                    className="input-premium h-12"
                                />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold uppercase tracking-widest text-sandstone-400 ml-1">E-mail Institucional</label>
                                    <input
                                        type="email"
                                        required
                                        value={formData.email}
                                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                        placeholder="contato@unidade.gov.br"
                                        className="input-premium h-12"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold uppercase tracking-widest text-sandstone-400 ml-1">Telefone / Ramal</label>
                                    <input
                                        type="text"
                                        required
                                        value={formData.phone}
                                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                        placeholder="(00) 00000-0000"
                                        className="input-premium h-12"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2 pt-2">
                                <label className="text-[10px] font-bold uppercase tracking-widest text-sandstone-400 ml-1">Responsável Técnico / Direção</label>
                                <div className="relative">
                                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-sandstone-400" />
                                    <input
                                        type="text"
                                        required
                                        value={formData.responsible}
                                        onChange={(e) => setFormData({ ...formData, responsible: e.target.value })}
                                        placeholder="Nome completo do médico ou gestor responsável"
                                        className="input-premium h-12 pl-12"
                                    />
                                </div>
                            </div>

                            <div className="flex gap-4 pt-8">
                                <button
                                    type="button"
                                    onClick={() => setShowModal(false)}
                                    className="flex-1 px-8 py-4 text-sandstone-400 font-bold uppercase tracking-widest text-[10px] hover:bg-sandstone-50 rounded-2xl transition-all"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="flex-2 btn-cardinal px-10 py-4 text-xs uppercase tracking-[0.2em] font-bold shadow-xl shadow-cardinal-100"
                                >
                                    {loading ? 'Processando...' : editingUnit ? 'Salvar Alterações' : 'Cadastrar Unidade'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
