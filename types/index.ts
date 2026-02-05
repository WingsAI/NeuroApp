// Representa a pessoa física (paciente único)
export interface Patient {
  id: string;
  name: string;
  cpf?: string;
  birthDate?: string;
  gender?: string;
  ethnicity?: string;
  education?: string;
  occupation?: string;
  phone?: string;
  underlyingDiseases?: any;
  ophthalmicDiseases?: any;
  createdAt: string;

  // Múltiplos exames/visitas do paciente
  exams: Exam[];

  // Campos para retrocompatibilidade (achatam o último exame)
  status?: 'pending' | 'in_analysis' | 'completed';
  examDate?: string;
  location?: string;
  technicianName?: string;
  images?: any[];
  report?: MedicalReport;
  referral?: PatientReferral;
}

// Representa cada visita/exame do paciente
export interface Exam {
  id: string;
  examDate: string;
  location: string;
  technicianName: string;
  status: 'pending' | 'in_analysis' | 'completed';
  eyerCloudId?: string;
  createdAt: string;

  patientId: string;
  patient?: Patient;

  images: ExamImage[];
  report?: MedicalReport;
  referral?: PatientReferral;
}

export interface ExamImage {
  id: string;
  url: string;
  data?: string; // URL assinada ou base64 para exibição
  fileName: string;
  type?: string; // COLOR ou ANTERIOR
  uploadedAt: string;
  examId: string;
}

// Mantido para retrocompatibilidade durante a transição
export interface PatientImage {
  id: string;
  data: string;
  fileName: string;
  uploadedAt: string;
  type?: string;
}

export interface MedicalReport {
  id: string;
  examId?: string;
  patientId?: string;
  doctorName: string;
  doctorCRM?: string;
  findings: string;
  diagnosis: string;
  recommendations: string;
  suggestedConduct?: string;
  diagnosticConditions: DiagnosticConditions;
  selectedImages?: { od: string | null, oe: string | null };
  completedAt: string;
  syncedToDrive?: boolean;
  driveFileId?: string;
}

export interface DiagnosticConditions {
  normal: boolean;
  drMild: boolean;
  drModerate: boolean;
  drSevere: boolean;
  drProliferative: boolean;
  glaucomaSuspect: boolean;
  hrMild: boolean;
  hrModerate: boolean;
  hrSevere: boolean;
  tumor: boolean;
  reconvocarUrgente: boolean;
  reconvocar: boolean;
  encaminhar: boolean;
  others: boolean;
  // Novos campos para limitação de qualidade
  odLimitationReason?: string;
  oeLimitationReason?: string;
}

export interface PatientReferral {
  id: string;
  examId?: string;
  patientId?: string;
  referredBy: string;
  referralDate: string;
  specialty: string;
  urgency: 'routine' | 'urgent' | 'emergency';
  notes: string;
  specializedService?: string;
  outcome?: string;
  outcomeDate?: string;
  scheduledDate?: string;
  status: 'pending' | 'scheduled' | 'completed' | 'outcome_defined';
}

export interface AnalyticsData {
  totalPatients: number;
  totalExams: number;
  totalImages: number;
  pendingReports: number;
  completedReports: number;
  patientsToday: number;
  examsToday: number;
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

// Helper type para exibição de paciente com exame selecionado
export interface PatientWithSelectedExam extends Patient {
  selectedExam?: Exam;
  totalExams: number;
}
