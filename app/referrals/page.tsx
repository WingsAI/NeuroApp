'use client';

import React, { useEffect, useState } from 'react';
import { Search, User, Calendar, FileCheck, CheckCircle2, Send, ArrowRight, ShieldCheck, X, AlertTriangle, Clock, Activity, MapPin } from 'lucide-react';
import Navbar from '@/components/Navbar';
import { getPatientsAction, updatePatientAction } from '@/app/actions/patients';
import { Patient } from '@/types';

export default function Referrals() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [filteredPatients, setFilteredPatients] = useState<Patient[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [referralForm, setReferralForm] = useState({
    referredBy: '',
    specialty: '',
    urgency: 'routine' as 'routine' | 'urgent' | 'emergency',
    notes: '',
    specializedService: '',
    outcome: '',
  });
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadPatients();
  }, []);

  useEffect(() => {
    filterPatients();
  }, [searchTerm, patients]);

  const loadPatients = async () => {
    const allPatients = await getPatientsAction();
    const completedPatients = (allPatients as any).filter(
      (p: Patient) => p.status === 'completed' && p.report && !p.referral
    );
    setPatients(completedPatients);
  };

  const filterPatients = () => {
    if (!searchTerm.trim()) {
      setFilteredPatients(patients);
      return;
    }

    const term = searchTerm.toLowerCase();
    const filtered = patients.filter(
      (p: Patient) =>
        p.name.toLowerCase().includes(term) ||
        p.cpf.includes(term) ||
        p.location.toLowerCase().includes(term)
    );
    setFilteredPatients(filtered);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setReferralForm(prev => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmitReferral = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedPatient) return;

    setLoading(true);

    const referral = {
      specialty: referralForm.specialty,
      urgency: referralForm.urgency,
      notes: referralForm.notes,
      specializedService: referralForm.specializedService,
      outcome: referralForm.outcome,
      status: referralForm.outcome ? 'outcome_defined' : 'pending',
      referralDate: new Date().toISOString(),
      outcomeDate: referralForm.outcome ? new Date().toISOString() : undefined,
      referredBy: referralForm.referredBy || 'Sistema', // Add referredBy here
    };

    await updatePatientAction(selectedPatient.id, {
      referral: referral,
    });

    setSuccess(true);

    setTimeout(() => {
      setShowModal(false);
      setSelectedPatient(null);
      setReferralForm({
        referredBy: '',
        specialty: '',
        urgency: 'routine',
        notes: '',
        specializedService: '',
        outcome: '',
      });
      setSuccess(false);
      setLoading(false);
      loadPatients();
    }, 1500);
  };

  const getConditionsList = (conditions: any) => {
    if (!conditions) return [];
    const labels: Record<string, string> = {
      diabeticRetinopathy: 'Retinopatia Diabética',
      glaucoma: 'Glaucoma',
      macularDegeneration: 'Degeneração Macular',
      cataract: 'Catarata',
    };

    return Object.entries(conditions)
      .filter(([_, value]) => value === true)
      .map(([key, _]) => labels[key] || key);
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedPatient(null);
    setReferralForm({
      referredBy: '',
      specialty: '',
      urgency: 'routine',
      notes: '',
      specializedService: '',
      outcome: '',
    });
  };

  const handleViewPatient = (patient: Patient) => {
    setSelectedPatient(patient);
    setShowModal(true);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR');
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      <div className="noise-overlay" />
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-20">
        <div className="stagger-load space-y-12">
          {/* Header Section */}
          <div className="max-w-2xl">
            <div className="accent-line" />
            <h1 className="text-4xl md:text-5xl font-serif font-bold text-charcoal mb-6 leading-[1.1]">
              Fila de <span className="text-cardinal-700 italic">Encaminhamentos</span>
            </h1>
            <p className="text-lg text-sandstone-600 font-medium">
              Gestão estratégica de pacientes analisados aguardando conduta especializada.
            </p>
          </div>

          {/* Search Bar */}
          <div className="relative max-w-2xl group">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-sandstone-400 group-focus-within:text-cardinal-700 transition-colors" />
            <input
              type="text"
              placeholder="Buscar por paciente, CPF ou unidade..."
              value={searchTerm}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
              className="input-premium pl-12 h-14 text-lg shadow-sm"
            />
          </div>

          {/* Patient Grid */}
          {filteredPatients.length === 0 ? (
            <div className="premium-card p-20 text-center bg-sandstone-50/30">
              <div className="relative inline-block mb-6">
                <Send className="h-16 w-16 text-sandstone-200" />
                <div className="absolute -top-1 -right-1 h-6 w-6 bg-cardinal-700 rounded-full flex items-center justify-center text-white text-[10px] font-bold">0</div>
              </div>
              <h3 className="text-2xl font-serif font-bold text-charcoal mb-2">Fila de encaminhamento vazia</h3>
              <p className="text-sandstone-600 font-medium">
                {searchTerm ? 'Nenhum registro corresponde aos critérios de busca.' : 'Todos os laudos assinados já foram encaminhados.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {filteredPatients.map((patient) => (
                <div
                  key={patient.id}
                  className="premium-card group cursor-pointer"
                  onClick={() => handleViewPatient(patient)}
                >
                  <div className="p-8">
                    <div className="flex items-start justify-between mb-8">
                      <div className="flex items-center space-x-4">
                        <div className="w-12 h-12 bg-sandstone-50 rounded-full flex items-center justify-center text-cardinal-700 group-hover:bg-cardinal-700 group-hover:text-white transition-all duration-500">
                          <User className="h-6 w-6" />
                        </div>
                        <div>
                          <h3 className="text-lg font-serif font-bold text-charcoal leading-tight group-hover:text-cardinal-700 transition-colors">
                            {patient.name}
                          </h3>
                          <p className="text-sm font-bold text-sandstone-400 uppercase tracking-widest">{patient.cpf}</p>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4 mb-8">
                      <div className="flex items-center text-sm font-medium text-sandstone-600">
                        <Calendar className="h-4 w-4 mr-3 text-sandstone-400" />
                        Exame: {formatDate(patient.examDate)}
                      </div>
                      <div className="p-4 bg-sandstone-50 rounded-xl border border-sandstone-100">
                        <p className="text-[10px] font-bold uppercase text-sandstone-400 tracking-wider mb-2">Conclusão do Laudo</p>
                        <p className="text-sm font-serif italic text-charcoal line-clamp-2 leading-relaxed">
                          "{patient.report?.diagnosis}"
                        </p>
                      </div>
                      {patient.report && getConditionsList(patient.report.diagnosticConditions).length > 0 && (
                        <div className="flex flex-wrap gap-2 pt-2">
                          {getConditionsList(patient.report.diagnosticConditions).slice(0, 2).map((condition, idx) => (
                            <span key={idx} className="px-2 py-0.5 bg-cardinal-50 text-cardinal-700 border border-cardinal-100 rounded text-[9px] font-bold uppercase tracking-wider">
                              {condition}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="pt-6 border-t border-sandstone-100 flex items-center justify-between">
                      <div className="flex flex-col">
                        <span className="text-[10px] font-bold uppercase text-sandstone-400 tracking-wider">Responsável</span>
                        <span className="text-xs font-serif text-charcoal italic">{patient.report?.doctorName}</span>
                      </div>
                      <button className="flex items-center text-cardinal-700 font-bold text-sm group-hover:translate-x-1 transition-transform">
                        Encaminhar <ArrowRight className="ml-2 w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Referral Modal */}
      {showModal && selectedPatient && selectedPatient.report && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8">
          <div className="absolute inset-0 bg-charcoal/40 backdrop-blur-sm transition-opacity" onClick={closeModal} />

          <div className="relative bg-white w-full max-w-3xl max-h-[90vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col stagger-load">
            {/* Modal Header */}
            <div className="px-8 py-6 bg-sandstone-50 border-b border-sandstone-100 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="p-3 bg-cardinal-700 rounded-xl text-white shadow-lg">
                  <Send className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="text-2xl font-serif font-bold text-charcoal">Gestão de Encaminhamento</h2>
                  <p className="text-sm font-medium text-sandstone-500">Protocolo de Referência Terciária</p>
                </div>
              </div>
              <button onClick={closeModal} className="p-2 hover:bg-white rounded-full transition-colors text-sandstone-400 hover:text-charcoal border border-transparent hover:border-sandstone-100">
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 space-y-8">
              {/* Report Summary Card */}
              <div className="premium-card p-8 bg-cardinal-950/5 relative">
                <div className="absolute top-0 right-0 p-4 opacity-10">
                  <FileCheck className="w-12 h-12 text-cardinal-700" />
                </div>
                <h3 className="text-sm font-bold uppercase tracking-widest text-cardinal-800 mb-6 flex items-center">
                  <ShieldCheck className="w-4 h-4 mr-2" /> Síntese do Laudo Clínico
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div>
                      <p className="text-[10px] font-bold uppercase text-sandstone-400 tracking-wider">Paciente</p>
                      <p className="text-base font-serif font-bold text-charcoal leading-tight">{selectedPatient.name}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase text-sandstone-400 tracking-wider">Responsável Laudo</p>
                      <p className="text-sm font-serif font-medium text-charcoal italic">{selectedPatient.report.doctorName}</p>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <p className="text-[10px] font-bold uppercase text-sandstone-400 tracking-wider">Conclusão Diagnóstica</p>
                      <p className="text-sm font-medium text-sandstone-600 line-clamp-2 italic">"{selectedPatient.report.diagnosis}"</p>
                    </div>
                    {getConditionsList(selectedPatient.report.diagnosticConditions).length > 0 && (
                      <div>
                        <p className="text-[10px] font-bold uppercase text-sandstone-400 tracking-wider mb-2">Marcadores de Alerta</p>
                        <div className="flex flex-wrap gap-2">
                          {getConditionsList(selectedPatient.report.diagnosticConditions).map((condition, idx) => (
                            <span key={idx} className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-white text-cardinal-700 border border-cardinal-100 rounded shadow-sm">
                              {condition}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Referral Form */}
              <form onSubmit={handleSubmitReferral} className="space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-sandstone-500 flex items-center">
                      <User className="w-3.5 h-3.5 mr-2" /> Responsável Referral
                    </label>
                    <input
                      type="text"
                      name="referredBy"
                      value={referralForm.referredBy}
                      onChange={handleInputChange}
                      required
                      className="input-premium"
                      placeholder="Nome do Técnico/Médico"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-sandstone-500 flex items-center">
                      <Send className="w-3.5 h-3.5 mr-2" /> Especialidade Destino
                    </label>
                    <select
                      name="specialty"
                      value={referralForm.specialty}
                      onChange={handleInputChange}
                      required
                      className="input-premium"
                    >
                      <option value="">Selecione a especialidade</option>
                      <option value="Oftalmologia Geral">Oftalmologia Geral</option>
                      <option value="Retina">Retina & Vítreo</option>
                      <option value="Glaucoma">Glaucoma</option>
                      <option value="Catarata">Catarata</option>
                      <option value="Córnea">Córnea & Doenças Externas</option>
                      <option value="Neuroftalmologia">Neuroftalmologia</option>
                      <option value="Uveíte">Uveíte & Inflamação</option>
                      <option value="Emergência">Pronto Atendimento</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-sandstone-500 flex items-center">
                      <MapPin className="w-3.5 h-3.5 mr-2" /> Serviço de Atenção Especializada
                    </label>
                    <select
                      name="specializedService"
                      value={referralForm.specializedService}
                      onChange={handleInputChange}
                      className="input-premium"
                    >
                      <option value="">Selecione o serviço</option>
                      <option value="AME - Ambulatório Médico de Especialidades">AME - Ambulatório Médico de Especialidades</option>
                      <option value="Hospital das Clínicas">Hospital das Clínicas</option>
                      <option value="Santa Casa">Santa Casa de Misericórdia</option>
                      <option value="Centro de Referência Estadual">Centro de Referência Estadual</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-sandstone-500 flex items-center">
                      <FileCheck className="w-3.5 h-3.5 mr-2" /> Desfecho / Resultado do Seguimento
                    </label>
                    <input
                      type="text"
                      name="outcome"
                      value={referralForm.outcome}
                      onChange={handleInputChange}
                      className="input-premium"
                      placeholder="Ex: Em tratamento medicamentoso / Cirurgia agendada"
                    />
                  </div>
                </div>

                <div className="space-y-6">
                  <label className="text-xs font-bold uppercase tracking-wider text-sandstone-500 flex items-center">
                    <AlertTriangle className="w-3.5 h-3.5 mr-2 text-cardinal-700" /> Priorização de Urgência
                  </label>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {[
                      { id: 'routine', label: 'Rotina', icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50/50' },
                      { id: 'urgent', label: 'Urgente', icon: Clock, color: 'text-yellow-600', bg: 'bg-yellow-50/50' },
                      { id: 'emergency', label: 'Emergência', icon: AlertTriangle, color: 'text-cardinal-700', bg: 'bg-cardinal-50/50' },
                    ].map((level) => (
                      <div
                        key={level.id}
                        onClick={() => setReferralForm({ ...referralForm, urgency: level.id as any })}
                        className={`p-4 rounded-xl border-2 cursor-pointer transition-all duration-300 flex items-center justify-between ${referralForm.urgency === level.id
                          ? 'border-cardinal-700 bg-white shadow-lg -translate-y-1'
                          : 'border-sandstone-100 bg-sandstone-50/30 hover:border-cardinal-200'
                          }`}
                      >
                        <div className="flex items-center space-x-3">
                          <level.icon className={`w-5 h-5 ${level.color}`} />
                          <span className={`text-sm font-bold uppercase tracking-widest ${referralForm.urgency === level.id ? 'text-charcoal' : 'text-sandstone-400'}`}>
                            {level.label}
                          </span>
                        </div>
                        {referralForm.urgency === level.id && (
                          <div className="h-4 w-4 rounded-full bg-cardinal-700 flex items-center justify-center">
                            <div className="h-1.5 w-1.5 rounded-full bg-white" />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-sandstone-500 flex items-center">
                    <ArrowRight className="w-3.5 h-3.5 mr-2" /> Notas Complementares
                  </label>
                  <textarea
                    name="notes"
                    value={referralForm.notes}
                    onChange={handleInputChange}
                    rows={3}
                    className="input-premium py-4"
                    placeholder="Observações pertinentes ao encaminhamento..."
                  />
                </div>

                {success && (
                  <div className="flex items-center p-5 bg-green-50 border border-green-200 rounded-2xl">
                    <CheckCircle2 className="h-5 w-5 text-green-600 mr-3" />
                    <p className="text-sm font-bold text-green-800 uppercase tracking-widest">Encaminhamento finalizado com sucesso</p>
                  </div>
                )}

                <div className="pt-8 border-t border-sandstone-100 flex gap-4">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="flex-1 px-8 py-4 text-sandstone-400 font-bold uppercase tracking-widest text-[10px] hover:bg-sandstone-50 rounded-xl transition-colors"
                  >
                    Descartar Rascunho
                  </button>
                  <button
                    type="submit"
                    disabled={success || loading}
                    className="flex-2 btn-cardinal text-sm uppercase tracking-widest font-bold flex items-center justify-center space-x-3"
                  >
                    {loading ? (
                      <Loader2 className="animate-spin w-5 h-5" />
                    ) : success ? (
                      <>
                        <CheckCircle2 className="w-5 h-5" />
                        <span>Referral Concluído</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-5 h-5" />
                        <span>Validar & Enviar Encaminhamento</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TimelineItem({ title, date, status, detail }: any) {
  return (
    <div className="relative group">
      <div className="absolute -left-[27px] top-1.5 w-4 h-4 rounded-full bg-white border-4 border-cardinal-700 shadow-sm z-10 group-hover:scale-125 transition-transform" />
      <div>
        <div className="flex items-center justify-between mb-1">
          <p className="text-sm font-bold text-charcoal uppercase tracking-tight">{title}</p>
          <span className="text-[10px] font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-full border border-green-100 uppercase tracking-widest">{status}</span>
        </div>
        <p className="text-[10px] font-bold text-sandstone-300 uppercase tracking-[0.2em] mb-2">{date}</p>
        <p className="text-xs font-medium text-sandstone-500 italic leading-relaxed">{detail}</p>
      </div>
    </div>
  );
}

const Loader2 = ({ className }: { className?: string }) => (
  <Activity className={className} />
);
