import { Patient, AnalyticsData } from '@/types';

const PATIENTS_KEY = 'neuroapp_patients';
const ANALYTICS_KEY = 'neuroapp_analytics';

// Funções para gerenciar pacientes
export const savePatient = (patient: Patient): void => {
  if (typeof window === 'undefined') return;

  const patients = getPatients();
  patients.push(patient);
  localStorage.setItem(PATIENTS_KEY, JSON.stringify(patients));
  updateAnalytics();
};

export const getPatients = (): Patient[] => {
  if (typeof window === 'undefined') return [];

  const data = localStorage.getItem(PATIENTS_KEY);
  return data ? JSON.parse(data) : [];
};

export const getPatientById = (id: string): Patient | undefined => {
  const patients = getPatients();
  return patients.find(p => p.id === id);
};

export const updatePatient = (id: string, updates: Partial<Patient>): void => {
  if (typeof window === 'undefined') return;

  const patients = getPatients();
  const index = patients.findIndex(p => p.id === id);

  if (index !== -1) {
    patients[index] = { ...patients[index], ...updates };
    localStorage.setItem(PATIENTS_KEY, JSON.stringify(patients));
    updateAnalytics();
  }
};

export const deletePatient = (id: string): void => {
  if (typeof window === 'undefined') return;

  const patients = getPatients();
  const filtered = patients.filter(p => p.id !== id);
  localStorage.setItem(PATIENTS_KEY, JSON.stringify(filtered));
  updateAnalytics();
};

// Funções para analytics
export const getAnalytics = (): AnalyticsData => {
  if (typeof window === 'undefined') {
    return {
      totalPatients: 0,
      totalImages: 0,
      pendingReports: 0,
      completedReports: 0,
      patientsToday: 0,
      imagesToday: 0,
      averageProcessingTime: 0,
    };
  }

  const data = localStorage.getItem(ANALYTICS_KEY);
  if (data) {
    return JSON.parse(data);
  }

  // Se não existir, calcular
  return calculateAnalytics();
};

const calculateAnalytics = (): AnalyticsData => {
  const patients = getPatients();
  const today = new Date().toISOString().split('T')[0];

  const totalImages = patients.reduce((sum, p) => sum + p.images.length, 0);
  const pendingReports = patients.filter(p => p.status === 'pending').length;
  const completedReports = patients.filter(p => p.status === 'completed').length;

  const patientsToday = patients.filter(p =>
    p.createdAt.split('T')[0] === today
  ).length;

  const imagesToday = patients
    .filter(p => p.createdAt.split('T')[0] === today)
    .reduce((sum, p) => sum + p.images.length, 0);

  // Calcular tempo médio de processamento (em horas)
  const completedPatients = patients.filter(p => p.status === 'completed' && p.report);
  const averageProcessingTime = completedPatients.length > 0
    ? completedPatients.reduce((sum, p) => {
        const created = new Date(p.createdAt).getTime();
        const completed = new Date(p.report!.completedAt).getTime();
        return sum + (completed - created) / (1000 * 60 * 60); // converter para horas
      }, 0) / completedPatients.length
    : 0;

  return {
    totalPatients: patients.length,
    totalImages,
    pendingReports,
    completedReports,
    patientsToday,
    imagesToday,
    averageProcessingTime: Math.round(averageProcessingTime * 10) / 10,
  };
};

const updateAnalytics = (): void => {
  if (typeof window === 'undefined') return;

  const analytics = calculateAnalytics();
  localStorage.setItem(ANALYTICS_KEY, JSON.stringify(analytics));
};

// Função auxiliar para gerar ID único
export const generateId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

// Função para converter arquivo para base64
export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = error => reject(error);
  });
};
