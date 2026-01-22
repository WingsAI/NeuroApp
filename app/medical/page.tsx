'use client';

import React, { useEffect, useState } from 'react';
import { Search, User, Calendar, MapPin, Image as ImageIcon, FileText, CheckCircle2, X, Activity, Eye, ArrowRight, ShieldCheck, Download, Loader2 } from 'lucide-react';
import Navbar from '@/components/Navbar';
import { getPatientsAction, updatePatientAction, createPatient } from '@/app/actions/patients';
import { Patient, MedicalReport } from '@/types';
import * as XLSX from 'xlsx';

export default function Medical() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [filteredPatients, setFilteredPatients] = useState<Patient[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [reportForm, setReportForm] = useState({
    doctorName: '',
    findings: '',
    diagnosis: '',
    recommendations: '',
  });
  const [diagnosticConditions, setDiagnosticConditions] = useState({
    diabeticRetinopathy: false,
    glaucoma: false,
    macularDegeneration: false,
    cataract: false,
  });
  const [patientEditableData, setPatientEditableData] = useState({
    cpf: '',
    phone: '',
  });
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    loadPatients();
  }, []);

  useEffect(() => {
    filterPatients();
  }, [searchTerm, patients]);

  const loadPatients = async () => {
    try {
      setIsSyncing(true);
      // 1. Carregar pacientes do Banco de Dados (Supabase)
      const dbPatients = await getPatientsAction();

      // 2. Carregar pacientes do Arquivo de Mapeamento (Bytescale)
      let combinedPatients: Patient[] = [...(dbPatients as any)];

      try {
        const response = await fetch('/bytescale_mapping.json');
        if (response.ok) {
          const mappingData = await response.json();
          const dbIds = new Set(dbPatients.map(p => p.id));

          const cloudEntries = Object.entries(mappingData);
          const patientsToSync: any[] = [];

          const cloudPatients: Patient[] = cloudEntries.map(([key, data]: [string, any]) => {
            const patientId = data.exam_id || key;
            const existingDbPatient = dbPatients.find(p => p.id === patientId);
            const isAlreadyInDb = !!existingDbPatient;

            if (!isAlreadyInDb) {
              patientsToSync.push({ id: patientId, data });
            }

            return {
              id: patientId,
              name: data.patient_name,
              cpf: isAlreadyInDb ? existingDbPatient.cpf : 'PENDENTE',
              phone: isAlreadyInDb ? existingDbPatient.phone || '' : '',
              birthDate: new Date().toISOString(),
              examDate: data.images[0]?.upload_date || new Date().toISOString(),
              location: 'Phelcom EyeR Cloud',
              technicianName: 'Sincronização Cloud',
              status: (isAlreadyInDb ? existingDbPatient.status : 'pending') as any,
              createdAt: data.images[0]?.upload_date || new Date().toISOString(),
              images: data.images.map((img: any, idx: number) => ({
                id: `${key}-${idx}`,
                data: img.bytescale_url,
                fileName: img.filename,
                uploadedAt: img.upload_date
              }))
            };
          });

          // Sincronização automática silenciosa (lote inicial de 10)
          if (patientsToSync.length > 0) {
            console.log(`Sincronizando ${patientsToSync.length} pacientes...`);
            for (const item of patientsToSync.slice(0, 10)) {
              try {
                const formData = new FormData();
                formData.append('name', item.data.patient_name);
                formData.append('cpf', `AUTO-${item.id.slice(0, 8)}`);
                formData.append('birthDate', new Date().toISOString());
                formData.append('examDate', item.data.images[0]?.upload_date || new Date().toISOString());
                formData.append('location', 'Phelcom EyeR Cloud');
                formData.append('technicianName', 'Auto Sync');
                item.data.images.forEach((img: any) => formData.append('eyerUrls', img.bytescale_url));
                await createPatient(formData);
              } catch (syncErr) {
                console.error(`Falha ao sincronizar ${item.id}:`, syncErr);
              }
            }
          }

          const uniqueCloudPatients = cloudPatients.filter(p => !dbIds.has(p.id));
          combinedPatients = [...combinedPatients, ...uniqueCloudPatients];
        }
      } catch (jsonErr) {
        console.error('Erro ao carregar mapping cloud:', jsonErr);
      }

      const pendingPatients = combinedPatients.filter(
        (p: Patient) => p.status === 'pending' || p.status === 'in_analysis'
      );

      setPatients(pendingPatients);
    } catch (err) {
      console.error('Erro ao carregar pacientes:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  const [visibleCount, setVisibleCount] = useState(10);

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
    setVisibleCount(10); // Reset pagination on search
    setFilteredPatients(filtered);
  };

  const displayedPatients = React.useMemo(() => {
    return filteredPatients.slice(0, visibleCount);
  }, [filteredPatients, visibleCount]);

  const handleSelectPatient = async (patient: any) => {
    setSelectedPatient(patient);
    setPatientEditableData({
      cpf: patient.cpf || '',
      phone: patient.phone || '',
    });
    setShowModal(true);

    // Se o CPF for 'PENDENTE', significa que é um paciente da nuvem que ainda não está no banco
    if (patient.cpf === 'PENDENTE') {
      try {
        setLoading(true);
        // Criar o paciente no banco de dados para poder gerar o laudo
        const formData = new FormData();
        formData.append('name', patient.name);
        formData.append('cpf', `AUTO-${patient.id.slice(0, 8)}`);
        formData.append('birthDate', patient.birthDate);
        formData.append('examDate', patient.examDate);
        formData.append('location', patient.location);
        formData.append('technicianName', patient.technicianName);

        // Adicionar URLs das imagens para o action processar
        patient.images.forEach((img: any) => {
          formData.append('eyerUrls', img.data);
        });

        const result = await createPatient(formData);
        if (result.success) {
          // Atualizar o ID local para o novo ID do DB
          const newPatient = { ...patient, id: result.id, cpf: `AUTO-${patient.id.slice(0, 8)}`, status: 'in_analysis' };
          setSelectedPatient(newPatient);
          setPatientEditableData({
            cpf: newPatient.cpf,
            phone: newPatient.phone || '',
          });
          await updatePatientAction(result.id, { status: 'in_analysis' });
          loadPatients();
        }
      } catch (err) {
        console.error('Erro ao registrar paciente da nuvem:', err);
      } finally {
        setLoading(false);
      }
    } else if (patient.status === 'pending') {
      await updatePatientAction(patient.id, { status: 'in_analysis' });
      loadPatients();
    }
  };

  const handleReportInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setReportForm(prev => ({
      ...prev,
      [name]: value,
    }));
  };

  const handlePatientDataChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setPatientEditableData(prev => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleConditionChange = (condition: keyof typeof diagnosticConditions) => {
    setDiagnosticConditions(prev => ({
      ...prev,
      [condition]: !prev[condition],
    }));
  };

  const handleSubmitReport = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedPatient) return;

    setLoading(true);

    try {
      const report = {
        doctorName: reportForm.doctorName,
        findings: reportForm.findings,
        diagnosis: reportForm.diagnosis,
        recommendations: reportForm.recommendations,
        diagnosticConditions: diagnosticConditions,
        completedAt: new Date().toISOString(),
      };

      await updatePatientAction(selectedPatient.id, {
        status: 'completed',
        cpf: patientEditableData.cpf,
        phone: patientEditableData.phone,
        report: report,
      });

      setSuccess(true);

      setTimeout(() => {
        setShowModal(false);
        setSelectedPatient(null);
        resetForm();
        setSuccess(false);
        loadPatients();
      }, 1500);
    } catch (err) {
      console.error('Erro ao salvar laudo:', err);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setReportForm({
      doctorName: '',
      findings: '',
      diagnosis: '',
      recommendations: '',
    });
    setDiagnosticConditions({
      diabeticRetinopathy: false,
      glaucoma: false,
      macularDegeneration: false,
      cataract: false,
    });
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedPatient(null);
    resetForm();
  };

  const handleExportExcel = () => {
    const dataToExport = filteredPatients.map(p => ({
      'Nome do Paciente': p.name,
      'CPF': p.cpf,
      'Telefone': p.phone || 'N/A',
      'Data do Exame': formatDate(p.examDate),
      'Localização': p.location,
      'Status': p.status === 'pending' ? 'Pendente' : p.status === 'in_analysis' ? 'Em Análise' : 'Concluído',
      'Médico': p.report?.doctorName || 'N/A',
      'Data do Laudo': p.report?.completedAt ? formatDate(p.report.completedAt) : 'N/A'
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Fila de Laudos");
    XLSX.writeFile(wb, `NeuroApp_Fila_Laudos_${new Date().toISOString().split('T')[0]}.xlsx`);
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
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="max-w-2xl">
              <div className="accent-line" />
              <h1 className="text-4xl md:text-5xl font-serif font-bold text-charcoal mb-6 leading-[1.1]">
                Fila de <span className="text-cardinal-700 italic">Laudos</span>
              </h1>
              <p className="text-lg text-sandstone-600 font-medium">
                Gestão clínica centralizada para análise neuroftalmológica em tempo real.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-4">
              {isSyncing && (
                <div className="flex items-center space-x-2 text-cardinal-700 animate-pulse bg-cardinal-50 px-4 py-2 rounded-lg border border-cardinal-100">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-[10px] font-bold uppercase tracking-widest">Sincronizando Nuvem...</span>
                </div>
              )}

              <button
                onClick={handleExportExcel}
                className="flex items-center space-x-2 bg-white border border-sandstone-200 px-6 py-3 rounded-xl text-sandstone-600 font-bold uppercase tracking-widest text-xs hover:bg-sandstone-50 hover:border-cardinal-200 hover:text-cardinal-700 transition-all shadow-sm"
              >
                <Download className="w-4 h-4" />
                <span>Exportar Excel</span>
              </button>
            </div>
          </div>

          {/* Search Bar */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="md:col-span-3 relative group">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-sandstone-400 group-focus-within:text-cardinal-700 transition-colors" />
              <input
                type="text"
                placeholder="Buscar por paciente, documento ou unidade..."
                value={searchTerm}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
                className="input-premium pl-12 h-14 text-lg shadow-sm"
              />
            </div>
            <div className="flex items-center justify-center p-4 bg-white rounded-xl border border-sandstone-100 shadow-sm">
              <p className="text-xs font-bold text-sandstone-500 uppercase tracking-widest">
                {patients.length} Pacientes na Fila
              </p>
            </div>
          </div>

          {/* Patient Grid */}
          {filteredPatients.length === 0 ? (
            <div className="premium-card p-20 text-center bg-sandstone-50/30">
              <div className="relative inline-block mb-6">
                <FileText className="h-16 w-16 text-sandstone-200" />
                <Activity className="absolute -bottom-1 -right-1 h-6 w-6 text-cardinal-700 animate-pulse" />
              </div>
              <h3 className="text-2xl font-serif font-bold text-charcoal mb-2">Sem pendências no momento</h3>
              <p className="text-sandstone-600 font-medium">
                {searchTerm ? 'Nenhum registro corresponde aos critérios de busca.' : 'Todos os laudos foram processados com sucesso.'}
              </p>
            </div>
          ) : (
            <div className="space-y-12">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {displayedPatients.map((patient) => (
                  <div
                    key={patient.id}
                    className="premium-card group cursor-pointer"
                    onClick={() => handleSelectPatient(patient)}
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
                        <span
                          className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${patient.status === 'pending'
                            ? 'bg-cardinal-50 text-cardinal-700 border border-cardinal-100'
                            : 'bg-blue-50 text-blue-700 border border-blue-100'
                            }`}
                        >
                          {patient.status === 'pending' ? 'Pendente' : 'Em Análise'}
                        </span>
                      </div>

                      <div className="space-y-4 mb-8">
                        <div className="flex items-center text-sm font-medium text-sandstone-600">
                          <Calendar className="h-4 w-4 mr-3 text-sandstone-400" />
                          Exame: {formatDate(patient.examDate)}
                        </div>
                        <div className="flex items-center text-sm font-medium text-sandstone-600">
                          <MapPin className="h-4 w-4 mr-3 text-sandstone-400" />
                          {patient.location}
                        </div>
                        <div className="flex items-center text-sm font-medium text-sandstone-600">
                          <ImageIcon className="h-4 w-4 mr-3 text-sandstone-400" />
                          {patient.images.length} capturas integradas
                        </div>
                        {patient.phone && (
                          <div className="flex items-center text-sm font-medium text-cardinal-700">
                            <Activity className="h-4 w-4 mr-3 text-cardinal-400" />
                            Contato: {patient.phone}
                          </div>
                        )}
                      </div>

                      <div className="pt-6 border-t border-sandstone-100 flex items-center justify-between">
                        <div className="flex flex-col">
                          <span className="text-[10px] font-bold uppercase text-sandstone-400 tracking-wider">Unidade</span>
                          <span className="text-xs font-serif text-charcoal italic">{patient.location}</span>
                        </div>
                        <button className="flex items-center text-cardinal-700 font-bold text-sm group-hover:translate-x-1 transition-transform">
                          Analisar <ArrowRight className="ml-2 w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Load More Button */}
              {visibleCount < filteredPatients.length && (
                <div className="flex justify-center">
                  <button
                    onClick={() => setVisibleCount(prev => prev + 12)}
                    className="btn-cardinal flex items-center space-x-2 px-12 py-4"
                  >
                    <ArrowRight className="h-5 w-5 rotate-90" />
                    <span className="uppercase tracking-widest text-sm font-bold">Carregar Mais Pacientes</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Modal Section - Redesigned with Glassmorphism */}
      {showModal && selectedPatient && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8">
          <div className="absolute inset-0 bg-charcoal/40 backdrop-blur-sm transition-opacity" onClick={closeModal} />

          <div className="relative bg-white w-full max-w-6xl max-h-[90vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col stagger-load">
            {/* Modal Header */}
            <div className="px-8 py-6 bg-sandstone-50 border-b border-sandstone-100 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="p-3 bg-cardinal-700 rounded-xl text-white shadow-lg">
                  <Activity className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="text-2xl font-serif font-bold text-charcoal">Terminal de Análise</h2>
                  <p className="text-sm font-medium text-sandstone-500">ID: {selectedPatient.id}</p>
                </div>
              </div>
              <button
                onClick={closeModal}
                className="p-2 hover:bg-white rounded-full transition-colors text-sandstone-400 hover:text-charcoal shadow-sm hover:shadow-md border border-transparent hover:border-sandstone-100"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              <div className="p-8 grid grid-cols-1 lg:grid-cols-12 gap-10">
                {/* Left Column: Data & Images */}
                <div className="lg:col-span-12 space-y-10">
                  {/* Bio Data Card */}
                  <div className="premium-card p-8 bg-cardinal-950/5 relative group">
                    <div className="absolute top-0 right-0 p-4">
                      <ShieldCheck className="w-8 h-8 text-cardinal-700 opacity-20" />
                    </div>
                    <h3 className="text-sm font-bold uppercase tracking-widest text-cardinal-800 mb-6 flex items-center">
                      <User className="w-4 h-4 mr-2" /> Dados Biométricos & Clínicos
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-8">
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold uppercase text-sandstone-400 tracking-wider">Paciente</p>
                        <p className="text-sm font-serif font-bold text-charcoal leading-tight">{selectedPatient.name}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold uppercase text-cardinal-700 tracking-wider">Documento (CPF)</p>
                        <input
                          type="text"
                          name="cpf"
                          value={patientEditableData.cpf}
                          onChange={handlePatientDataChange}
                          className="w-full bg-transparent border-b border-sandstone-200 text-sm font-serif font-bold text-charcoal focus:border-cardinal-500 transition-colors outline-none"
                          placeholder="000.000.000-00"
                        />
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold uppercase text-cardinal-700 tracking-wider">Contato (Telefone)</p>
                        <input
                          type="text"
                          name="phone"
                          value={patientEditableData.phone}
                          onChange={handlePatientDataChange}
                          className="w-full bg-transparent border-b border-sandstone-200 text-sm font-serif font-bold text-charcoal focus:border-cardinal-500 transition-colors outline-none"
                          placeholder="(00) 00000-0000"
                        />
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold uppercase text-sandstone-400 tracking-wider">Data Exame</p>
                        <p className="text-sm font-serif font-bold text-charcoal leading-tight">{formatDate(selectedPatient.examDate)}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold uppercase text-sandstone-400 tracking-wider">Unidade</p>
                        <p className="text-sm font-serif font-bold text-charcoal leading-tight">{selectedPatient.location}</p>
                      </div>
                    </div>
                  </div>

                  {/* Image Grid */}
                  <div className="space-y-6">
                    <h3 className="text-xl font-serif font-bold text-charcoal italic flex items-center">
                      <Eye className="w-5 h-5 mr-3 text-cardinal-700" /> Galeria de Captura Integrada
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                      {selectedPatient.images.map((image, index) => (
                        <div key={image.id} className="premium-card group bg-white p-2">
                          <div className="relative aspect-square overflow-hidden rounded-lg">
                            <img
                              src={image.data}
                              alt={`Captura ${index + 1}`}
                              className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                            />
                            <div className="absolute inset-0 bg-charcoal/0 group-hover:bg-charcoal/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                              <button
                                onClick={() => window.open(image.data, '_blank')}
                                className="p-3 bg-white text-charcoal rounded-full shadow-xl hover:scale-110 transition-transform"
                              >
                                <Search className="w-5 h-5" />
                              </button>
                            </div>
                          </div>
                          <div className="px-3 py-4 flex justify-between items-center">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-sandstone-400">Captura {index + 1}</span>
                            <span className="text-[10px] font-serif italic text-sandstone-600">ID: {image.id.slice(0, 8)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Diagnosis Form */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                    <form onSubmit={handleSubmitReport} className="space-y-8">
                      <div className="space-y-6">
                        <h3 className="text-xl font-serif font-bold text-charcoal italic">Registro do Laudo</h3>

                        <div className="space-y-2">
                          <label className="text-sm font-bold uppercase tracking-wider text-sandstone-500">Responsável pela Análise</label>
                          <input
                            type="text"
                            name="doctorName"
                            value={reportForm.doctorName}
                            onChange={handleReportInputChange}
                            required
                            className="input-premium"
                            placeholder="Dr(a). Nome do Especialista"
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="text-sm font-bold uppercase tracking-wider text-sandstone-500">Achados Clínicos Detalhados</label>
                          <textarea
                            name="findings"
                            value={reportForm.findings}
                            onChange={handleReportInputChange}
                            required
                            rows={4}
                            className="input-premium py-4"
                            placeholder="Descreva morfologia, simetria e possíveis anomalias..."
                          />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-2">
                            <label className="text-sm font-bold uppercase tracking-wider text-sandstone-500">Diagnóstico Conclusivo</label>
                            <textarea
                              name="diagnosis"
                              value={reportForm.diagnosis}
                              onChange={handleReportInputChange}
                              required
                              rows={3}
                              className="input-premium py-4"
                              placeholder="Conclusão clínica..."
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-bold uppercase tracking-wider text-sandstone-500">Plano Terapêutico / Recomendações</label>
                            <textarea
                              name="recommendations"
                              value={reportForm.recommendations}
                              onChange={handleReportInputChange}
                              required
                              rows={3}
                              className="input-premium py-4"
                              placeholder="Tratamentos ou exames complementares..."
                            />
                          </div>
                        </div>
                      </div>

                      <div className="pt-8 border-t border-sandstone-100 flex gap-4">
                        <button
                          type="button"
                          onClick={closeModal}
                          className="flex-1 px-8 py-4 text-sandstone-500 font-bold uppercase tracking-widest text-xs hover:bg-sandstone-100 rounded-xl transition-colors"
                        >
                          Arquivar Análise
                        </button>
                        <button
                          type="submit"
                          disabled={success}
                          className="flex-3 btn-cardinal text-sm uppercase tracking-widest font-bold flex items-center justify-center space-x-3"
                        >
                          {success ? (
                            <>
                              <CheckCircle2 className="w-5 h-5" />
                              <span>Laudo Validado</span>
                            </>
                          ) : (
                            <>
                              <ShieldCheck className="w-5 h-5" />
                              <span>Concluir & Assinar Laudo</span>
                            </>
                          )}
                        </button>
                      </div>
                    </form>

                    {/* Checkboxes Area */}
                    <div className="premium-card p-10 bg-sandstone-50/50 flex flex-col h-full border-none">
                      <div className="mb-8">
                        <h3 className="text-lg font-serif font-bold text-charcoal mb-2">Sinalizadores de Condição</h3>
                        <p className="text-xs font-medium text-sandstone-500 italic">Selecione todas as patologias identificadas durante o escrutínio das imagens.</p>
                      </div>

                      <div className="grid grid-cols-1 gap-4 flex-1">
                        {[
                          { id: 'diabeticRetinopathy', label: 'Retinopatia Diabética', desc: 'Alterações vasculares retinianas correlacionadas' },
                          { id: 'glaucoma', label: 'Glaucoma Suspeito/Confirmado', desc: 'Aumento da escavação ou sinais de neuropatia óptica' },
                          { id: 'macularDegeneration', label: 'Degeneração Macular (DMRI)', desc: 'Presença de drusas ou alterações pigmentares maculares' },
                          { id: 'cataract', label: 'Opacidade Cristalina (Catarata)', desc: 'Diminuição da transparência do cristalino observada' },
                        ].map((condition) => (
                          <div
                            key={condition.id}
                            onClick={() => handleConditionChange(condition.id as keyof typeof diagnosticConditions)}
                            className={`p-5 rounded-2xl border-2 cursor-pointer transition-all duration-300 flex items-start space-x-4 ${diagnosticConditions[condition.id as keyof typeof diagnosticConditions]
                              ? 'bg-cardinal-700 border-cardinal-700 text-white shadow-lg'
                              : 'bg-white border-sandstone-100 hover:border-cardinal-200 text-charcoal group'
                              }`}
                          >
                            <div className={`mt-1 h-5 w-5 rounded-full border-2 flex items-center justify-center ${diagnosticConditions[condition.id as keyof typeof diagnosticConditions]
                              ? 'border-white bg-white'
                              : 'border-sandstone-300'
                              }`}>
                              {diagnosticConditions[condition.id as keyof typeof diagnosticConditions] && (
                                <div className="h-2 w-2 rounded-full bg-cardinal-700" />
                              )}
                            </div>
                            <div>
                              <p className="text-sm font-bold uppercase tracking-wider">{condition.label}</p>
                              <p className={`text-[10px] ${diagnosticConditions[condition.id as keyof typeof diagnosticConditions]
                                ? 'text-white/70'
                                : 'text-sandstone-400 font-medium italic'
                                }`}>{condition.desc}</p>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="mt-8 p-6 bg-cardinal-50 rounded-2xl border border-cardinal-100 flex items-start space-x-4">
                        <div className="p-2 bg-cardinal-700 rounded-lg text-white">
                          <Activity className="w-5 h-5 translate-y-[2px]" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-cardinal-900 uppercase tracking-widest leading-normal">Monitoramento Crítico</p>
                          <p className="text-[10px] text-cardinal-700 font-medium italic">O sistema registra automaticamente o tempo de resposta entre a entrada do paciente e a assinatura do laudo para fins de KPI organizacional.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
