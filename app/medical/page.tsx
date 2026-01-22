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
    doctorName: 'Gustavo Sakuno',
    imageQuality: 'satisfactory' as 'satisfactory' | 'unsatisfactory',
    opticNerve: '',
    retina: '',
    vessels: '',
    diagnosis: '',
    recommendations: '',
    isOpticNerveStandard: false,
    isRetinaStandard: false,
    isVesselsStandard: false,
  });
  const [diagnosticConditions, setDiagnosticConditions] = useState({
    normal: false,
    drMild: false,
    drModerate: false,
    drSevere: false,
    drProliferative: false,
    glaucomaSuspect: false,
    others: false,
  });
  const [patientEditableData, setPatientEditableData] = useState({
    cpf: '',
    phone: '',
  });
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [visibleCount, setVisibleCount] = useState(10);
  const [isSyncing, setIsSyncing] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedReportImages, setSelectedReportImages] = useState<string[]>([]);

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

            // Se o paciente está no DB mas não tem imagens, vamos usar as da nuvem
            const images = (isAlreadyInDb && existingDbPatient.images && existingDbPatient.images.length > 0)
              ? existingDbPatient.images
              : data.images.map((img: any, idx: number) => ({
                id: `${key}-${idx}`,
                data: img.bytescale_url,
                fileName: img.filename,
                uploadedAt: img.upload_date
              }));

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
              images: images
            };
          });

          // Sincronização automática silenciosa (lote inicial de 10)
          if (patientsToSync.length > 0) {
            console.log(`Sincronizando ${patientsToSync.length} pacientes...`);
            for (const item of patientsToSync.slice(0, 10)) {
              try {
                const formData = new FormData();
                formData.append('id', item.id);
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

          // Mesclar: Usar cloudPatients como base para os que estão na nuvem, 
          // e adicionar dbPatients que NÃO estão no mapeamento da nuvem
          const cloudIds = new Set(cloudPatients.map(p => p.id));
          const dbOnlyPatients = dbPatients.filter(p => !cloudIds.has(p.id)) as any;

          combinedPatients = [...cloudPatients, ...dbOnlyPatients];
        }
      } catch (jsonErr) {
        console.error('Erro ao carregar mapping cloud:', jsonErr);
      }

      // Deduplicação final por Nome e Data do Exame
      const seen = new Set();
      const finalPatients = combinedPatients.filter(p => {
        const key = `${p.name}-${p.examDate.slice(0, 10)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      const pendingPatients = finalPatients.filter(
        (p: Patient) => p.status === 'pending' || p.status === 'in_analysis'
      );

      setPatients(pendingPatients);
    } catch (err) {
      console.error('Erro ao carregar pacientes:', err);
    } finally {
      setIsSyncing(false);
    }
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
        formData.append('id', patient.id);
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
    const { name, value, type } = e.target;

    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;

      // Auto-preenchimento baseado nos padrões solicitados
      let autoValue = '';
      if (name === 'isOpticNerveStandard' && checked) autoValue = "Corado, bordos nítidos, escavação fisiológica";
      if (name === 'isRetinaStandard' && checked) autoValue = "Aplicada, mácula preservada, sem hemorragias ou exsudatos.";
      if (name === 'isVesselsStandard' && checked) autoValue = "Calibre e trajeto habitual";

      setReportForm(prev => ({
        ...prev,
        [name]: checked,
        ...(autoValue ? { [name.replace('is', '').replace('Standard', '').charAt(0).toLowerCase() + name.replace('is', '').replace('Standard', '').slice(1)]: autoValue } : {})
      }));
    } else {
      setReportForm(prev => ({
        ...prev,
        [name]: value,
      }));
    }
  };

  const handleQualityChange = (quality: 'satisfactory' | 'unsatisfactory') => {
    setReportForm(prev => ({
      ...prev,
      imageQuality: quality,
      // Se for insatisfatório, já podemos sugerir um diagnóstico de imagem insatisfatória
      ...(quality === 'unsatisfactory' ? { diagnosis: 'Imagem Insatisfatória para Laudo' } : {})
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
        findings: JSON.stringify({
          imageQuality: reportForm.imageQuality,
          opticNerve: reportForm.opticNerve,
          retina: reportForm.retina,
          vessels: reportForm.vessels,
        }),
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
      doctorName: 'Gustavo Sakuno',
      imageQuality: 'satisfactory',
      opticNerve: '',
      retina: '',
      vessels: '',
      diagnosis: '',
      recommendations: '',
      isOpticNerveStandard: false,
      isRetinaStandard: false,
      isVesselsStandard: false,
    });
    setDiagnosticConditions({
      normal: false,
      drMild: false,
      drModerate: false,
      drSevere: false,
      drProliferative: false,
      glaucomaSuspect: false,
      others: false,
    });
  };

  const handleToggleImageForReport = (imageId: string) => {
    setSelectedReportImages(prev => {
      if (prev.includes(imageId)) {
        return prev.filter(id => id !== imageId);
      }
      if (prev.length >= 2) {
        return [prev[1], imageId];
      }
      return [...prev, imageId];
    });
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedPatient(null);
    setSelectedReportImages([]);
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
                                type="button"
                                onClick={() => setSelectedImage(image.data)}
                                className="p-3 bg-white text-charcoal rounded-full shadow-xl hover:scale-110 transition-transform"
                              >
                                <Search className="w-5 h-5" />
                              </button>
                            </div>
                          </div>
                          <div className="px-3 py-4 flex justify-between items-center bg-sandstone-50/50">
                            <div>
                              <span className="text-[10px] font-bold uppercase tracking-widest text-sandstone-400 block">Captura {index + 1}</span>
                              <span className="text-[10px] font-serif italic text-sandstone-500">OD/OE Scanned</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleToggleImageForReport(image.id)}
                              className={`px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-tighter transition-all ${selectedReportImages.includes(image.id)
                                ? 'bg-cardinal-700 text-white shadow-inner'
                                : 'bg-white border border-sandstone-200 text-sandstone-600 hover:border-cardinal-300'
                                }`}
                            >
                              {selectedReportImages.includes(image.id) ? 'Selecionado' : 'Selecionar'}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                    {/* Selected Images View (Sticky-ish) */}
                    <div className="lg:col-span-4 space-y-6 lg:sticky lg:top-0">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xl font-serif font-bold text-charcoal italic flex items-center">
                          <ImageIcon className="w-5 h-5 mr-3 text-cardinal-700" /> Comparativo Selecionado
                        </h3>
                        <span className="text-[10px] font-bold text-white bg-cardinal-700 px-3 py-1 rounded-full uppercase tracking-widest">
                          {selectedReportImages.length}/2 selecionadas
                        </span>
                      </div>

                      {selectedReportImages.length === 0 ? (
                        <div className="p-12 border-2 border-dashed border-sandstone-200 rounded-3xl text-center bg-sandstone-50/50">
                          <Eye className="w-12 h-12 text-sandstone-300 mx-auto mb-4" />
                          <p className="text-sm font-bold text-sandstone-400 uppercase tracking-widest">Selecione 2 capturas acima para comparar</p>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {selectedReportImages.map((imageId, idx) => {
                            const img = selectedPatient.images.find(i => i.id === imageId);
                            if (!img) return null;
                            return (
                              <div key={img.id} className="premium-card p-2 bg-white relative group overflow-hidden">
                                <img src={img.data} className="w-full h-auto rounded-xl shadow-inner aspect-[4/3] object-cover" />
                                <div className="absolute top-4 left-4">
                                  <span className="bg-cardinal-700 text-white text-[10px] font-extrabold px-3 py-1 rounded-lg uppercase shadow-lg">
                                    {idx === 0 ? 'Olho Direito' : 'Olho Esquerdo'}
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleToggleImageForReport(img.id)}
                                  className="absolute top-4 right-4 p-2 bg-white/90 text-cardinal-700 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-md"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Diagnosis Form */}
                    <div className="lg:col-span-8">
                      <div className="premium-card p-0 overflow-hidden border-none shadow-xl">
                        <div className="p-8 bg-white space-y-8">
                          <form onSubmit={handleSubmitReport} className="space-y-8">
                            <div className="space-y-6">
                              <h3 className="text-xl font-serif font-bold text-charcoal italic">Registro do Laudo</h3>

                              <div className="space-y-2">
                                <label className="text-sm font-bold uppercase tracking-wider text-sandstone-500">Médico Responsável</label>
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

                              {/* Qualidade da Imagem */}
                              <div className="space-y-4 p-4 bg-sandstone-50 rounded-xl border border-sandstone-100">
                                <label className="text-sm font-bold uppercase tracking-wider text-sandstone-500 block">Qualidade da Imagem</label>
                                <div className="flex gap-4">
                                  <button
                                    type="button"
                                    onClick={() => handleQualityChange('satisfactory')}
                                    className={`flex-1 py-3 px-4 rounded-lg font-bold text-xs uppercase tracking-widest transition-all ${reportForm.imageQuality === 'satisfactory' ? 'bg-green-600 text-white shadow-md' : 'bg-white text-sandstone-400 border border-sandstone-200'}`}
                                  >
                                    Satisfatório
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleQualityChange('unsatisfactory')}
                                    className={`flex-1 py-3 px-4 rounded-lg font-bold text-xs uppercase tracking-widest transition-all ${reportForm.imageQuality === 'unsatisfactory' ? 'bg-cardinal-700 text-white shadow-md' : 'bg-white text-sandstone-400 border border-sandstone-200'}`}
                                  >
                                    Insatisfatório
                                  </button>
                                </div>
                              </div>

                              {/* Achados Anatômicos */}
                              <div className="space-y-6">
                                {/* Nervo Óptico */}
                                <div className="space-y-3">
                                  <div className="flex justify-between items-center">
                                    <label className="text-sm font-bold uppercase tracking-wider text-sandstone-500">Nervo Óptico</label>
                                    <label className="flex items-center space-x-2 cursor-pointer group">
                                      <input
                                        type="checkbox"
                                        name="isOpticNerveStandard"
                                        checked={reportForm.isOpticNerveStandard}
                                        onChange={handleReportInputChange}
                                        className="rounded border-sandstone-300 text-cardinal-700 focus:ring-cardinal-500"
                                      />
                                      <span className="text-[10px] font-bold uppercase text-sandstone-400 group-hover:text-cardinal-700 transition-colors">Padrão Normativo</span>
                                    </label>
                                  </div>
                                  <textarea
                                    name="opticNerve"
                                    value={reportForm.opticNerve}
                                    onChange={handleReportInputChange}
                                    required={reportForm.imageQuality === 'satisfactory'}
                                    rows={2}
                                    className="input-premium py-3 text-sm"
                                    placeholder="Descreva o nervo óptico..."
                                  />
                                </div>

                                {/* Retina */}
                                <div className="space-y-3">
                                  <div className="flex justify-between items-center">
                                    <label className="text-sm font-bold uppercase tracking-wider text-sandstone-500">Retina</label>
                                    <label className="flex items-center space-x-2 cursor-pointer group">
                                      <input
                                        type="checkbox"
                                        name="isRetinaStandard"
                                        checked={reportForm.isRetinaStandard}
                                        onChange={handleReportInputChange}
                                        className="rounded border-sandstone-300 text-cardinal-700 focus:ring-cardinal-500"
                                      />
                                      <span className="text-[10px] font-bold uppercase text-sandstone-400 group-hover:text-cardinal-700 transition-colors">Padrão Normativo</span>
                                    </label>
                                  </div>
                                  <textarea
                                    name="retina"
                                    value={reportForm.retina}
                                    onChange={handleReportInputChange}
                                    required={reportForm.imageQuality === 'satisfactory'}
                                    rows={2}
                                    className="input-premium py-3 text-sm"
                                    placeholder="Descreva a retina..."
                                  />
                                </div>

                                {/* Vasos */}
                                <div className="space-y-3">
                                  <div className="flex justify-between items-center">
                                    <label className="text-sm font-bold uppercase tracking-wider text-sandstone-500">Vasos</label>
                                    <label className="flex items-center space-x-2 cursor-pointer group">
                                      <input
                                        type="checkbox"
                                        name="isVesselsStandard"
                                        checked={reportForm.isVesselsStandard}
                                        onChange={handleReportInputChange}
                                        className="rounded border-sandstone-300 text-cardinal-700 focus:ring-cardinal-500"
                                      />
                                      <span className="text-[10px] font-bold uppercase text-sandstone-400 group-hover:text-cardinal-700 transition-colors">Padrão Normativo</span>
                                    </label>
                                  </div>
                                  <textarea
                                    name="vessels"
                                    value={reportForm.vessels}
                                    onChange={handleReportInputChange}
                                    required={reportForm.imageQuality === 'satisfactory'}
                                    rows={2}
                                    className="input-premium py-3 text-sm"
                                    placeholder="Descreva os vasos..."
                                  />
                                </div>
                              </div>

                              <div className="space-y-2 pt-4">
                                <label className="text-sm font-bold uppercase tracking-wider text-sandstone-500">Recomendações e Plano Terapêutico</label>
                                <textarea
                                  name="recommendations"
                                  value={reportForm.recommendations}
                                  onChange={handleReportInputChange}
                                  rows={2}
                                  className="input-premium py-3 text-sm"
                                  placeholder="Recomendações adicionais..."
                                />
                              </div>
                            </div>

                            <div className="space-y-8">
                              <h3 className="text-lg font-serif font-bold text-charcoal border-b pb-4">Conclusão do Exame</h3>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {[
                                  { id: 'normal', label: 'Exame Normal', desc: 'Sem alterações funcionais' },
                                  { id: 'drMild', label: 'RD Leve', desc: 'Retinopatia Diabética' },
                                  { id: 'drModerate', label: 'RD Moderada', desc: 'Retinopatia Diabética' },
                                  { id: 'drSevere', label: 'RD Grave', desc: 'Retinopatia Diabética' },
                                  { id: 'drProliferative', label: 'RD Proliferativa', desc: 'Retinopatia Diabética' },
                                  { id: 'glaucomaSuspect', label: 'Suspeita de Glaucoma', desc: 'Neuropatia óptica' },
                                  { id: 'others', label: 'Outros', desc: 'Descrever abaixo' },
                                ].map((condition) => (
                                  <div
                                    key={condition.id}
                                    onClick={() => handleConditionChange(condition.id as keyof typeof diagnosticConditions)}
                                    className={`p-3 rounded-xl border-2 cursor-pointer transition-all flex items-start space-x-3 ${diagnosticConditions[condition.id as keyof typeof diagnosticConditions]
                                      ? 'bg-cardinal-700 border-cardinal-700 text-white'
                                      : 'bg-sandstone-50 border-sandstone-100 hover:border-cardinal-200 text-charcoal'
                                      }`}
                                  >
                                    <div className={`mt-1 h-3.5 w-3.5 rounded-full border-2 flex items-center justify-center ${diagnosticConditions[condition.id as keyof typeof diagnosticConditions] ? 'border-white bg-white' : 'border-sandstone-300'}`}>
                                      {diagnosticConditions[condition.id as keyof typeof diagnosticConditions] && <div className="h-1.5 w-1.5 rounded-full bg-cardinal-700" />}
                                    </div>
                                    <div>
                                      <p className="text-[10px] font-extrabold uppercase tracking-widest leading-tight">{condition.label}</p>
                                    </div>
                                  </div>
                                ))}
                              </div>

                              {/* Campo livre para "Outros" ou Diagnóstico Detalhado */}
                              <div className="space-y-2">
                                <label className="text-[10px] font-bold uppercase tracking-wider text-sandstone-500">Detalhamento do Diagnóstico / Conclusão Livre</label>
                                <textarea
                                  name="diagnosis"
                                  value={reportForm.diagnosis}
                                  onChange={handleReportInputChange}
                                  required
                                  rows={3}
                                  className="input-premium py-4 text-sm"
                                  placeholder="Escreva a conclusão clínica completa aqui..."
                                />
                              </div>
                            </div>

                            <div className="pt-8 border-t border-sandstone-100 flex gap-4">
                              <button
                                type="button"
                                onClick={closeModal}
                                className="flex-1 px-8 py-4 text-sandstone-500 font-bold uppercase tracking-widest text-[10px] hover:bg-sandstone-100 rounded-xl transition-colors"
                              >
                                Arquivar
                              </button>
                              <button
                                type="submit"
                                disabled={success || selectedReportImages.length < 2}
                                className={`flex-3 px-8 py-4 rounded-xl text-white font-bold uppercase tracking-widest text-xs flex items-center justify-center space-x-3 transition-all ${selectedReportImages.length < 2
                                  ? 'bg-sandstone-300 cursor-not-allowed'
                                  : 'bg-cardinal-700 hover:bg-cardinal-800 shadow-lg shadow-cardinal-200'}`}
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
                            {selectedReportImages.length < 2 && (
                              <p className="text-[10px] text-center text-cardinal-600 font-bold uppercase tracking-widest animate-pulse">
                                * Selecione 2 imagens acima para habilitar a assinatura
                              </p>
                            )}
                          </form>
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

      {/* Internal Lightbox for Images */}
      {selectedImage && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 md:p-12 animate-in fade-in zoom-in duration-300">
          <div className="absolute inset-0 bg-charcoal/95 backdrop-blur-md" onClick={() => setSelectedImage(null)} />

          <div className="relative max-w-5xl w-full max-h-full flex flex-col items-center">
            <button
              onClick={() => setSelectedImage(null)}
              className="absolute -top-12 right-0 p-3 text-white hover:text-cardinal-400 transition-colors"
            >
              <X className="h-8 w-8" />
            </button>
            <img
              src={selectedImage}
              alt="Visualização Ampliada"
              className="w-full h-auto object-contain rounded-lg shadow-2xl border border-white/10"
            />
            <div className="mt-4 px-6 py-2 bg-white/10 backdrop-blur rounded-full border border-white/20">
              <p className="text-white text-xs font-bold uppercase tracking-widest">Visualização em Alta Definição</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
