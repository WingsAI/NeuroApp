'use client';

import React, { useEffect, useState } from 'react';
import { Search, User, Calendar, MapPin, Image as ImageIcon, FileText, CheckCircle2, X, Activity, Eye, ArrowRight, ShieldCheck, Download, Loader2 } from 'lucide-react';
import Navbar from '@/components/Navbar';
import { getPatientsAction, updatePatientAction, createPatient, getCloudMappingAction } from '@/app/actions/patients';
import { Patient, MedicalReport } from '@/types';
import { useRouter } from 'next/navigation';
import * as XLSX from 'xlsx';

export default function Medical() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [filteredPatients, setFilteredPatients] = useState<Patient[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);
  const [reportForm, setReportForm] = useState({
    doctorName: 'Dr. Gustavo Sakuno',
    od: {
      quality: 'satisfactory' as 'satisfactory' | 'unsatisfactory',
      opticNerve: '',
      retina: '',
      vessels: '',
      isOpticNerveStandard: false,
      isRetinaStandard: false,
      isVesselsStandard: false,
    },
    oe: {
      quality: 'satisfactory' as 'satisfactory' | 'unsatisfactory',
      opticNerve: '',
      retina: '',
      vessels: '',
      isOpticNerveStandard: false,
      isRetinaStandard: false,
      isVesselsStandard: false,
    },
    diagnosis: '',
    recommendations: '',
  });
  const [diagnosticConditions, setDiagnosticConditions] = useState({
    normal: false,
    drMild: false,
    drModerate: false,
    drSevere: false,
    drProliferative: false,
    glaucomaSuspect: false,
    hrMild: false,
    hrModerate: false,
    hrSevere: false,
    hypertensiveRetinopathy: false,
    tumor: false,
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
  const [selectedReportImages, setSelectedReportImages] = useState<{ od: string | null, oe: string | null }>({
    od: null,
    oe: null
  });

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
        const mappingData = await getCloudMappingAction();
        if (mappingData) {
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
              patientsToSync.push({ id: patientId, data: data });
            }

            return {
              id: patientId,
              name: data.patient_name,
              cpf: isAlreadyInDb ? existingDbPatient.cpf : data.cpf || 'PENDENTE',
              phone: isAlreadyInDb ? existingDbPatient.phone || '' : data.phone || '',
              birthDate: data.birthday ? new Date(data.birthday).toISOString() : new Date().toISOString(),
              examDate: data.images[0]?.upload_date || new Date().toISOString(),
              location: data.clinic_name || 'Phelcom EyeR Cloud',
              gender: data.gender || '',
              technicianName: 'EyerCloud Sync',
              underlyingDiseases: data.underlying_diseases,
              ophthalmicDiseases: data.ophthalmic_diseases,
              status: (isAlreadyInDb ? existingDbPatient.status : 'pending') as any,
              createdAt: data.images[0]?.upload_date || new Date().toISOString(),
              images: images
            };
          });

          // Sincronização automática silenciosa (lote controlado para garantir dados)
          if (patientsToSync.length > 0) {
            console.log(`Sincronizando ${patientsToSync.length} pacientes...`);
            for (const item of patientsToSync.slice(0, 30)) {
              try {
                const formData = new FormData();
                formData.append('id', item.id);
                formData.append('name', item.data.patient_name);
                formData.append('cpf', item.data.cpf || `AUTO-${item.id.slice(0, 8)}`);
                formData.append('birthDate', item.data.birthday ? new Date(item.data.birthday).toISOString() : new Date().toISOString());
                formData.append('examDate', item.data.images[0]?.upload_date || new Date().toISOString());
                formData.append('location', item.data.clinic_name || 'Phelcom EyeR Cloud');
                formData.append('technicianName', 'Auto Sync');
                formData.append('gender', item.data.gender || '');

                if (item.data.underlying_diseases) {
                  formData.append('underlyingDiseases', JSON.stringify(item.data.underlying_diseases));
                }
                if (item.data.ophthalmic_diseases) {
                  formData.append('ophthalmicDiseases', JSON.stringify(item.data.ophthalmic_diseases));
                }

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
        // Criar o paciente no banco de dados para poder gerar o laudo (mantendo status pendente)
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
          // Atualizar o ID local para o novo ID do DB com status pendente
          const newPatient = { ...patient, id: result.id, cpf: `AUTO-${patient.id.slice(0, 8)}`, status: 'pending' };
          setSelectedPatient(newPatient);
          setPatientEditableData({
            cpf: newPatient.cpf,
            phone: newPatient.phone || '',
          });
          loadPatients();
        }
      } catch (err) {
        console.error('Erro ao registrar paciente da nuvem:', err);
      } finally {
        setLoading(false);
      }
    }
  };

  const handleEyeReportInputChange = (eye: 'od' | 'oe', e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;

    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      let autoValue = '';
      if (name === 'isOpticNerveStandard' && checked) autoValue = "Corado, bordos nítidos, escavação fisiológica";
      if (name === 'isRetinaStandard' && checked) autoValue = "Aplicada, mácula preservada, sem hemorragias ou exsudatos.";
      if (name === 'isVesselsStandard' && checked) autoValue = "Calibre e trajeto habitual";

      setReportForm(prev => ({
        ...prev,
        [eye]: {
          ...prev[eye],
          [name]: checked,
          ...(autoValue ? { [name.replace('is', '').replace('Standard', '').charAt(0).toLowerCase() + name.replace('is', '').replace('Standard', '').slice(1)]: autoValue } : {})
        }
      }));
    } else {
      setReportForm(prev => ({
        ...prev,
        [eye]: {
          ...prev[eye],
          [name]: value
        }
      }));
    }
  };

  const handleEyeQualityChange = (eye: 'od' | 'oe', quality: 'satisfactory' | 'unsatisfactory') => {
    setReportForm(prev => ({
      ...prev,
      [eye]: {
        ...prev[eye],
        quality,
      },
      // Se for insatisfatório em qualquer um, sugerir no diagnóstico
      ...(quality === 'unsatisfactory' ? { diagnosis: `Imagem Insatisfatória para Laudo (${eye.toUpperCase()})` } : {})
    }));
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
        findings: JSON.stringify({
          od: reportForm.od,
          oe: reportForm.oe,
        }),
        diagnosis: reportForm.diagnosis,
        recommendations: reportForm.recommendations,
        diagnosticConditions: diagnosticConditions,
        selectedImages: selectedReportImages,
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
        router.push('/referrals');
      }, 1500);
    } catch (err) {
      console.error('Erro ao salvar laudo:', err);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setReportForm({
      doctorName: 'Dr. Gustavo Sakuno',
      od: {
        quality: 'satisfactory',
        opticNerve: '',
        retina: '',
        vessels: '',
        isOpticNerveStandard: false,
        isRetinaStandard: false,
        isVesselsStandard: false,
      },
      oe: {
        quality: 'satisfactory',
        opticNerve: '',
        retina: '',
        vessels: '',
        isOpticNerveStandard: false,
        isRetinaStandard: false,
        isVesselsStandard: false,
      },
      diagnosis: '',
      recommendations: '',
    });
    setDiagnosticConditions({
      normal: false,
      drMild: false,
      drModerate: false,
      drSevere: false,
      drProliferative: false,
      glaucomaSuspect: false,
      hrMild: false,
      hrModerate: false,
      hrSevere: false,
      hypertensiveRetinopathy: false,
      tumor: false,
      others: false,
    });
  };

  const handleSelectImageForEye = (eye: 'od' | 'oe', imageId: string) => {
    setSelectedReportImages(prev => ({
      ...prev,
      [eye]: prev[eye] === imageId ? null : imageId
    }));
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedPatient(null);
    setSelectedReportImages({ od: null, oe: null });
    resetForm();
  };

  const handleExportExcel = () => {
    const dataToExport = filteredPatients.map(p => {
      let findings: any = {};
      try {
        if (p.report?.findings) {
          findings = JSON.parse(p.report.findings);
        }
      } catch (e) {
        console.error("Erro ao parsear achados para exportação", e);
      }

      const conditions = p.report?.diagnosticConditions || {};

      return {
        // Dados do Paciente
        'Nome do Paciente': p.name,
        'CPF': p.cpf,
        'Telefone': p.phone || 'N/A',
        'Data do Exame': formatDate(p.examDate),
        'Unidade/Localização': p.location,
        'Status': p.status === 'pending' ? 'Pendente' : p.status === 'in_analysis' ? 'Em Análise' : 'Concluído',

        // Dados do Médico e Laudo
        'Médico Laudador': p.report?.doctorName || 'N/A',
        'Data do Laudo': p.report?.completedAt ? formatDate(p.report.completedAt) : 'N/A',

        // Achados Olho Direito (OD)
        'OD Qualidade': findings.od?.quality === 'satisfactory' ? 'Satisfatória' : findings.od?.quality === 'unsatisfactory' ? 'Insatisfatória' : 'N/A',
        'OD Nervo Óptico': findings.od?.opticNerve || 'N/A',
        'OD Retina': findings.od?.retina || 'N/A',
        'OD Vasos': findings.od?.vessels || 'N/A',

        // Achados Olho Esquerdo (OE)
        'OE Qualidade': findings.oe?.quality === 'satisfactory' ? 'Satisfatória' : findings.oe?.quality === 'unsatisfactory' ? 'Insatisfatória' : 'N/A',
        'OE Nervo Óptico': findings.oe?.opticNerve || 'N/A',
        'OE Retina': findings.oe?.retina || 'N/A',
        'OE Vasos': findings.oe?.vessels || 'N/A',

        // Conclusões
        'Diagnóstico Conclusivo': p.report?.diagnosis || 'N/A',
        'Recomendações': p.report?.recommendations || 'N/A',

        // Sinalizadores Diagnósticos
        'Condição: Normal': (conditions as any).normal ? 'Sim' : 'Não',
        'Condição: RD Leve': (conditions as any).drMild ? 'Sim' : 'Não',
        'Condição: RD Moderada': (conditions as any).drModerate ? 'Sim' : 'Não',
        'Condição: RD Grave': (conditions as any).drSevere ? 'Sim' : 'Não',
        'Condição: RD Proliferativa': (conditions as any).drProliferative ? 'Sim' : 'Não',
        'Condição: Suspeita Glaucoma': (conditions as any).glaucomaSuspect ? 'Sim' : 'Não',
        'Condição: Retinopatia Hipertensiva': (conditions as any).hypertensiveRetinopathy ? 'Sim' : 'Não',
        'Condição: RH Leve': (conditions as any).hrMild ? 'Sim' : 'Não',
        'Condição: RH Moderada': (conditions as any).hrModerate ? 'Sim' : 'Não',
        'Condição: RH Grave': (conditions as any).hrSevere ? 'Sim' : 'Não',
        'Condição: Tumor': (conditions as any).tumor ? 'Sim' : 'Não',
        'Condição: Outros': (conditions as any).others ? 'Sim' : 'Não',
      };
    });

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Fila de Laudos Detalhada");
    XLSX.writeFile(wb, `NeuroApp_Laudos_Completo_${new Date().toISOString().split('T')[0]}.xlsx`);
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
                      <div className="flex items-center justify-between mb-8 gap-4">
                        <div className="flex items-center space-x-4 min-w-0 flex-1">
                          <div className="flex-shrink-0 w-12 h-12 bg-sandstone-50 rounded-full flex items-center justify-center text-cardinal-700 group-hover:bg-cardinal-700 group-hover:text-white transition-all duration-500">
                            <User className="h-6 w-6" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <h3 className="text-lg font-serif font-bold text-charcoal leading-tight group-hover:text-cardinal-700 transition-colors truncate">
                              {patient.name}
                            </h3>
                            <p className="text-sm font-bold text-sandstone-400 uppercase tracking-widest truncate">{patient.cpf}</p>
                          </div>
                        </div>
                        <span
                          className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider flex-shrink-0 whitespace-nowrap ${patient.status === 'pending'
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
                          {patient.location.trim().startsWith('Tauá') ? 'Tauá-Ceará' : patient.location}
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
                          <span className="text-xs font-serif text-charcoal italic">{patient.location.trim().startsWith('Tauá') ? 'Tauá-Ceará' : patient.location}</span>
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
              <div className="p-8 space-y-10">
                {/* 1. Bio Data Card */}
                <div className="premium-card p-8 bg-cardinal-950/5 relative group">
                  <div className="absolute top-0 right-0 p-4">
                    <ShieldCheck className="w-8 h-8 text-cardinal-700 opacity-20" />
                  </div>
                  <h3 className="text-sm font-bold uppercase tracking-widest text-cardinal-800 mb-6 flex items-center">
                    <User className="w-4 h-4 mr-2" /> Dados Biométricos & Clínicos
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-8">
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold uppercase text-sandstone-400 tracking-wider">Paciente</p>
                      <p className="text-sm font-serif font-bold text-charcoal leading-tight">{selectedPatient.name}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold uppercase text-cardinal-700 tracking-wider">Documento (CPF)</p>
                      <p className="text-sm font-serif font-bold text-charcoal leading-tight">{selectedPatient.cpf || 'Não informado'}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold uppercase text-sandstone-400 tracking-wider">Data Nasc.</p>
                      <p className="text-sm font-serif font-bold text-charcoal leading-tight">{formatDate(selectedPatient.birthDate)}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold uppercase text-sandstone-400 tracking-wider">Sexo</p>
                      <p className="text-sm font-serif font-bold text-charcoal leading-tight">{selectedPatient.gender === 'F' ? 'Feminino' : selectedPatient.gender === 'M' ? 'Masculino' : 'Outro'}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold uppercase text-sandstone-400 tracking-wider">Data Exame</p>
                      <p className="text-sm font-serif font-bold text-charcoal leading-tight">{formatDate(selectedPatient.examDate)}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold uppercase text-sandstone-400 tracking-wider">Unidade</p>
                      <p className="text-sm font-serif font-bold text-charcoal leading-tight">{selectedPatient.location.trim().startsWith('Tauá') ? 'Tauá-Ceará' : selectedPatient.location}</p>
                    </div>
                  </div>

                  {/* Diseases Section */}
                  {(selectedPatient.underlyingDiseases || selectedPatient.ophthalmicDiseases) && (
                    <div className="mt-8 pt-8 border-t border-sandstone-100 grid grid-cols-1 md:grid-cols-2 gap-12">
                      <div className="space-y-4">
                        <h4 className="text-[10px] font-bold uppercase tracking-widest text-cardinal-800 flex items-center">
                          <Activity className="w-3 h-3 mr-2" /> Doenças de Base
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {selectedPatient.underlyingDiseases && Object.entries(selectedPatient.underlyingDiseases)
                            .filter(([_, value]) => value === true)
                            .map(([key, _]) => (
                              <span key={key} className="px-3 py-1.5 bg-cardinal-50 border border-cardinal-100 text-cardinal-700 rounded-lg text-[10px] font-bold uppercase italic">
                                {key === 'hypertension' ? 'Hipertensão' :
                                  key === 'diabetes' ? 'Diabetes' :
                                    key === 'cholesterol' ? 'Colesterol' :
                                      key === 'smoker' ? 'Tabagismo' : key}
                              </span>
                            ))}
                          {(!selectedPatient.underlyingDiseases || Object.values(selectedPatient.underlyingDiseases).every(v => v !== true)) && (
                            <span className="text-[10px] text-sandstone-400 italic">Nenhuma informada</span>
                          )}
                        </div>
                      </div>
                      <div className="space-y-4">
                        <h4 className="text-[10px] font-bold uppercase tracking-widest text-cardinal-800 flex items-center">
                          <Eye className="w-3 h-3 mr-2" /> Doenças Oftalmológicas
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {selectedPatient.ophthalmicDiseases && Object.entries(selectedPatient.ophthalmicDiseases)
                            .filter(([_, value]) => value === true)
                            .map(([key, _]) => (
                              <span key={key} className="px-3 py-1.5 bg-sandstone-50 border border-sandstone-200 text-sandstone-500 rounded-lg text-[10px] font-bold uppercase italic">
                                {key === 'diabeticRetinopathy' ? 'RD' : key.charAt(0).toUpperCase() + key.slice(1)}
                              </span>
                            ))}
                          {(!selectedPatient.ophthalmicDiseases || Object.values(selectedPatient.ophthalmicDiseases).every(v => v !== true)) && (
                            <span className="text-[10px] text-sandstone-400 italic">Nenhuma informada</span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* 2. Image Gallery for Selection */}
                <div className="space-y-6">
                  <div className="flex items-center justify-between border-b border-sandstone-100 pb-4">
                    <h3 className="text-xl font-serif font-bold text-charcoal italic flex items-center">
                      <Eye className="w-5 h-5 mr-3 text-cardinal-700" /> Galeria de Captura Integrada
                    </h3>
                    <div className="flex gap-3">
                      <div className={`px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest flex items-center space-x-2 ${selectedReportImages.od ? 'bg-green-100 text-green-700' : 'bg-sandstone-100 text-sandstone-400'}`}>
                        <CheckCircle2 className={`w-3 h-3 ${selectedReportImages.od ? 'block' : 'hidden'}`} />
                        <span>OD {selectedReportImages.od ? 'Definido' : 'Pendente'}</span>
                      </div>
                      <div className={`px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest flex items-center space-x-2 ${selectedReportImages.oe ? 'bg-green-100 text-green-700' : 'bg-sandstone-100 text-sandstone-400'}`}>
                        <CheckCircle2 className={`w-3 h-3 ${selectedReportImages.oe ? 'block' : 'hidden'}`} />
                        <span>OE {selectedReportImages.oe ? 'Definido' : 'Pendente'}</span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                    {selectedPatient.images.map((image, index) => (
                      <div key={image.id} className={`premium-card p-1 group transition-all ${selectedReportImages.od === image.id || selectedReportImages.oe === image.id ? 'ring-2 ring-cardinal-700 bg-cardinal-50' : 'bg-white'}`}>
                        <div className="relative aspect-square overflow-hidden rounded-lg mb-2">
                          <img src={image.data} className="w-full h-full object-cover" />
                        </div>
                        <div className="flex flex-col gap-1 px-1 pb-1">
                          <button
                            onClick={() => handleSelectImageForEye('od', image.id)}
                            className={`w-full py-1.5 rounded text-[9px] font-bold uppercase tracking-tighter transition-all ${selectedReportImages.od === image.id ? 'bg-cardinal-700 text-white' : 'bg-sandstone-50 text-sandstone-500 hover:bg-cardinal-100'}`}
                          >
                            Olho Direito
                          </button>
                          <button
                            onClick={() => handleSelectImageForEye('oe', image.id)}
                            className={`w-full py-1.5 rounded text-[9px] font-bold uppercase tracking-tighter transition-all ${selectedReportImages.oe === image.id ? 'bg-cardinal-700 text-white' : 'bg-sandstone-50 text-sandstone-500 hover:bg-cardinal-100'}`}
                          >
                            Olho Esquerdo
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 3. Split Analysis View */}
                <form onSubmit={handleSubmitReport} className="space-y-12">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                    {/* OD Column */}
                    <div className="space-y-8">
                      <div className="flex items-center space-x-3 mb-4">
                        <div className="h-8 w-1.5 bg-cardinal-700 rounded-full" />
                        <h4 className="text-2xl font-serif font-bold text-charcoal">Olho Direito (OD)</h4>
                      </div>

                      <div className="premium-card p-4 bg-white min-h-[500px] space-y-6 shadow-xl border-t-4 border-t-cardinal-700">
                        {selectedReportImages.od ? (
                          <div className="aspect-[4/3] rounded-xl overflow-hidden shadow-inner border border-sandstone-100">
                            <img src={selectedPatient.images.find(i => i.id === selectedReportImages.od)?.data} className="w-full h-full object-cover" />
                          </div>
                        ) : (
                          <div className="aspect-[4/3] rounded-xl bg-sandstone-50 border-2 border-dashed border-sandstone-200 flex flex-col items-center justify-center text-sandstone-300">
                            <Eye className="w-12 h-12 mb-2" />
                            <p className="text-[10px] font-bold uppercase">Selecione uma imagem OD acima</p>
                          </div>
                        )}

                        <div className="space-y-6">
                          {/* Quality */}
                          <div className="flex items-center justify-between p-3 bg-sandstone-50 rounded-lg border border-sandstone-100">
                            <span className="text-[10px] font-bold uppercase text-sandstone-500">Qualidade</span>
                            <div className="flex gap-2">
                              {['satisfactory', 'unsatisfactory'].map((q) => (
                                <button
                                  key={q}
                                  type="button"
                                  onClick={() => handleEyeQualityChange('od', q as any)}
                                  className={`px-3 py-1 rounded text-[9px] font-bold uppercase tracking-widest transition-all ${reportForm.od.quality === q ? (q === 'satisfactory' ? 'bg-green-600 text-white' : 'bg-cardinal-700 text-white') : 'bg-white text-sandstone-400 border border-sandstone-200'}`}
                                >
                                  {q === 'satisfactory' ? 'Satisfatória' : 'Insatisfatória'}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Findings OD */}
                          {['opticNerve', 'retina', 'vessels'].map((field) => {
                            const labels: any = { opticNerve: 'Nervo Óptico', retina: 'Retina', vessels: 'Vasos' };
                            const standardKey: any = `is${field.charAt(0).toUpperCase()}${field.slice(1)}Standard`;
                            return (
                              <div key={field} className="space-y-2">
                                <div className="flex justify-between items-center px-1">
                                  <label className="text-[10px] font-bold uppercase tracking-widest text-sandstone-500">{labels[field]}</label>
                                  <label className="flex items-center space-x-1.5 cursor-pointer group">
                                    <input
                                      type="checkbox"
                                      name={standardKey}
                                      checked={(reportForm.od as any)[standardKey]}
                                      onChange={(e) => handleEyeReportInputChange('od', e)}
                                      className="w-3 h-3 rounded border-sandstone-300 text-cardinal-700 focus:ring-0"
                                    />
                                    <span className="text-[8px] font-bold uppercase text-sandstone-300 group-hover:text-cardinal-700 transition-colors">Padrão</span>
                                  </label>
                                </div>
                                <textarea
                                  name={field}
                                  value={(reportForm.od as any)[field]}
                                  onChange={(e) => handleEyeReportInputChange('od', e)}
                                  rows={2}
                                  className="w-full bg-sandstone-50/50 border border-sandstone-100 rounded-lg p-3 text-xs font-serif leading-relaxed focus:bg-white focus:ring-1 focus:ring-cardinal-700 outline-none transition-all"
                                  placeholder={`Relatório ${labels[field]}...`}
                                />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* OE Column */}
                    <div className="space-y-8">
                      <div className="flex items-center space-x-3 mb-4">
                        <div className="h-8 w-1.5 bg-cardinal-700 rounded-full" />
                        <h4 className="text-2xl font-serif font-bold text-charcoal">Olho Esquerdo (OE)</h4>
                      </div>

                      <div className="premium-card p-4 bg-white min-h-[500px] space-y-6 shadow-xl border-t-4 border-t-cardinal-700">
                        {selectedReportImages.oe ? (
                          <div className="aspect-[4/3] rounded-xl overflow-hidden shadow-inner border border-sandstone-100">
                            <img src={selectedPatient.images.find(i => i.id === selectedReportImages.oe)?.data} className="w-full h-full object-cover" />
                          </div>
                        ) : (
                          <div className="aspect-[4/3] rounded-xl bg-sandstone-50 border-2 border-dashed border-sandstone-200 flex flex-col items-center justify-center text-sandstone-300">
                            <Eye className="w-12 h-12 mb-2" />
                            <p className="text-[10px] font-bold uppercase">Selecione uma imagem OE acima</p>
                          </div>
                        )}

                        <div className="space-y-6">
                          {/* Quality */}
                          <div className="flex items-center justify-between p-3 bg-sandstone-50 rounded-lg border border-sandstone-100">
                            <span className="text-[10px] font-bold uppercase text-sandstone-500">Qualidade</span>
                            <div className="flex gap-2">
                              {['satisfactory', 'unsatisfactory'].map((q) => (
                                <button
                                  key={q}
                                  type="button"
                                  onClick={() => handleEyeQualityChange('oe', q as any)}
                                  className={`px-3 py-1 rounded text-[9px] font-bold uppercase tracking-widest transition-all ${reportForm.oe.quality === q ? (q === 'satisfactory' ? 'bg-green-600 text-white' : 'bg-cardinal-700 text-white') : 'bg-white text-sandstone-400 border border-sandstone-200'}`}
                                >
                                  {q === 'satisfactory' ? 'Satisfatória' : 'Insatisfatória'}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Findings OE */}
                          {['opticNerve', 'retina', 'vessels'].map((field) => {
                            const labels: any = { opticNerve: 'Nervo Óptico', retina: 'Retina', vessels: 'Vasos' };
                            const standardKey: any = `is${field.charAt(0).toUpperCase()}${field.slice(1)}Standard`;
                            return (
                              <div key={field} className="space-y-2">
                                <div className="flex justify-between items-center px-1">
                                  <label className="text-[10px] font-bold uppercase tracking-widest text-sandstone-500">{labels[field]}</label>
                                  <label className="flex items-center space-x-1.5 cursor-pointer group">
                                    <input
                                      type="checkbox"
                                      name={standardKey}
                                      checked={(reportForm.oe as any)[standardKey]}
                                      onChange={(e) => handleEyeReportInputChange('oe', e)}
                                      className="w-3 h-3 rounded border-sandstone-300 text-cardinal-700 focus:ring-0"
                                    />
                                    <span className="text-[8px] font-bold uppercase text-sandstone-300 group-hover:text-cardinal-700 transition-colors">Padrão</span>
                                  </label>
                                </div>
                                <textarea
                                  name={field}
                                  value={(reportForm.oe as any)[field]}
                                  onChange={(e) => handleEyeReportInputChange('oe', e)}
                                  rows={2}
                                  className="w-full bg-sandstone-50/50 border border-sandstone-100 rounded-lg p-3 text-xs font-serif leading-relaxed focus:bg-white focus:ring-1 focus:ring-cardinal-700 outline-none transition-all"
                                  placeholder={`Relatório ${labels[field]}...`}
                                />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 4. Unified Conclusion */}
                  <div className="max-w-4xl mx-auto space-y-10 pt-10 border-t-2 border-sandstone-100">
                    <div className="text-center space-y-2">
                      <h3 className="text-2xl font-serif font-bold text-charcoal italic">Conclusão Clínica Unificada</h3>
                      <p className="text-xs font-bold uppercase tracking-widest text-sandstone-400">Sumário Diagnóstico & Assinatura</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                      <div className="space-y-6">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-sandstone-500 block mb-4">Sinalizadores de Condição</label>
                        <div className="grid grid-cols-2 gap-3">
                          {[
                            { id: 'normal', label: 'Exame Normal' },
                            { id: 'drMild', label: 'RD Leve' },
                            { id: 'drModerate', label: 'RD Moderada' },
                            { id: 'drSevere', label: 'RD Grave' },
                            { id: 'drProliferative', label: 'RD Proliferativa' },
                            { id: 'glaucomaSuspect', label: 'Glaucoma Suspeito' },
                            { id: 'hypertensiveRetinopathy', label: 'Retinopatia Hipertensiva' },
                            { id: 'hrMild', label: 'RH Leve' },
                            { id: 'hrModerate', label: 'RH Moderada' },
                            { id: 'hrSevere', label: 'RH Grave' },
                            { id: 'tumor', label: 'Tumor / Massa' },
                            { id: 'others', label: 'Outros Achados' },
                          ].map((condition) => (
                            <button
                              key={condition.id}
                              type="button"
                              onClick={() => handleConditionChange(condition.id as keyof typeof diagnosticConditions)}
                              className={`p-3 rounded-xl border text-[10px] font-bold uppercase tracking-widest transition-all text-left flex items-center gap-3 ${diagnosticConditions[condition.id as keyof typeof diagnosticConditions]
                                ? 'bg-cardinal-700 border-cardinal-700 text-white shadow-lg'
                                : 'bg-white border-sandstone-100 text-sandstone-500 hover:border-cardinal-200'
                                }`}
                            >
                              <div className={`w-3 h-3 rounded-full border-2 ${diagnosticConditions[condition.id as keyof typeof diagnosticConditions] ? 'bg-white border-white' : 'border-sandstone-200'}`} />
                              {condition.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-6">
                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-sandstone-500">Médico Responsável</label>
                            {reportForm.doctorName === 'Dr. Gustavo Sakuno' && (
                              <span className="text-[10px] font-bold text-cardinal-700 bg-cardinal-50 px-2 py-0.5 rounded border border-cardinal-100 italic transition-all animate-in fade-in slide-in-from-right-2">CRM-SP 177.943</span>
                            )}
                          </div>
                          <input
                            type="text"
                            name="doctorName"
                            value={reportForm.doctorName}
                            onChange={handleReportInputChange}
                            required
                            className="w-full bg-sandstone-50/50 border border-sandstone-200 rounded-xl px-4 py-3 text-sm font-serif font-bold text-charcoal outline-none focus:bg-white focus:ring-2 focus:ring-cardinal-700/10 transition-all"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold uppercase tracking-widest text-sandstone-500">Diagnóstico Conclusivo / Recomendações</label>
                          <textarea
                            name="diagnosis"
                            value={reportForm.diagnosis}
                            onChange={handleReportInputChange}
                            required
                            rows={4}
                            className="w-full bg-sandstone-50/50 border border-sandstone-200 rounded-xl px-4 py-4 text-sm font-serif leading-relaxed text-charcoal outline-none focus:bg-white focus:ring-2 focus:ring-cardinal-700/10 transition-all"
                            placeholder="Escreva a conclusão diagnóstica final aqui..."
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-center pt-8">
                      <button
                        type="submit"
                        disabled={success || !selectedReportImages.od || !selectedReportImages.oe}
                        className={`min-w-[400px] px-12 py-5 rounded-2xl text-white font-bold uppercase tracking-[0.2em] text-xs flex items-center justify-center space-x-4 transition-all shadow-2xl ${(!selectedReportImages.od || !selectedReportImages.oe)
                          ? 'bg-sandstone-300 cursor-not-allowed grayscale'
                          : 'bg-cardinal-800 hover:bg-cardinal-900 shadow-cardinal-200'}`}
                      >
                        {success ? (
                          <>
                            <CheckCircle2 className="w-6 h-6" />
                            <span>Laudo Validado com Sucesso</span>
                          </>
                        ) : (
                          <>
                            <ShieldCheck className="w-6 h-6" />
                            <span>Validar & Assinar Digitalmente</span>
                          </>
                        )}
                      </button>
                    </div>
                    {(!selectedReportImages.od || !selectedReportImages.oe) && (
                      <p className="text-center text-[10px] font-bold text-cardinal-600 uppercase tracking-widest animate-pulse">
                        * Selecione uma imagem para cada olho na galeria acima para habilitar a assinatura
                      </p>
                    )}
                  </div>
                </form>
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
