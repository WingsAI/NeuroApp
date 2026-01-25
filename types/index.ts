export interface Patient {
  id: string;
  name: string;
  cpf: string;
  birthDate: string;
  examDate: string;
  location: string;
  technicianName: string;
  gender?: string;
  ethnicity?: string;
  education?: string;
  occupation?: string;
  phone?: string;
  images: PatientImage[];
  status: 'pending' | 'in_analysis' | 'completed';
  report?: MedicalReport;
  referral?: PatientReferral;
  underlyingDiseases?: any;
  ophthalmicDiseases?: any;
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
  diagnosticConditions: DiagnosticConditions;
  completedAt: string;
}

export interface DiagnosticConditions {
  normal: boolean;
  drMild: boolean;
  drModerate: boolean;
  drSevere: boolean;
  drProliferative: boolean;
  glaucomaSuspect: boolean;
  hypertensiveRetinopathy: boolean;
  tumor: boolean;
  others: boolean;
}

export interface PatientReferral {
  id: string;
  patientId: string;
  referredBy: string;
  referralDate: string;
  specialty: string;
  urgency: 'routine' | 'urgent' | 'emergency';
  notes: string;
  specializedService?: string;
  outcome?: string;
  outcomeDate?: string;
  status: 'pending' | 'scheduled' | 'completed' | 'outcome_defined';
}

export interface AnalyticsData {
  totalPatients: number;
  totalImages: number;
  pendingReports: number;
  completedReports: number;
  patientsToday: number;
  imagesToday: number;
  averageProcessingTime: number;
  productivityByRegion?: Record<string, number>;
  productivityByProfessional?: Record<string, number>;
}
export interface HealthUnit {
  id: string;
  name: string;
  address: string;
  email: string;
  phone: string;
  responsible: string;
  createdAt: string;
  updatedAt: string;
}
