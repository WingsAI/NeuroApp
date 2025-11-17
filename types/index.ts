export interface Patient {
  id: string;
  name: string;
  cpf: string;
  birthDate: string;
  examDate: string;
  location: string;
  technicianName: string;
  images: PatientImage[];
  status: 'pending' | 'in_analysis' | 'completed';
  report?: MedicalReport;
  createdAt: string;
}

export interface PatientImage {
  id: string;
  data: string; // base64
  fileName: string;
  uploadedAt: string;
}

export interface MedicalReport {
  id: string;
  patientId: string;
  doctorName: string;
  findings: string;
  diagnosis: string;
  recommendations: string;
  completedAt: string;
}

export interface AnalyticsData {
  totalPatients: number;
  totalImages: number;
  pendingReports: number;
  completedReports: number;
  patientsToday: number;
  imagesToday: number;
  averageProcessingTime: number;
}
