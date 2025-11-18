import { Patient } from '@/types';

// Imagens de exemplo (placeholders SVG)
const createMockImage = (color: string, label: string) => {
  return `data:image/svg+xml;base64,${btoa(`
    <svg width="400" height="300" xmlns="http://www.w3.org/2000/svg">
      <rect width="400" height="300" fill="${color}"/>
      <circle cx="200" cy="150" r="80" fill="rgba(255,255,255,0.3)"/>
      <circle cx="180" cy="130" r="30" fill="rgba(255,255,255,0.5)"/>
      <circle cx="220" cy="130" r="30" fill="rgba(255,255,255,0.5)"/>
      <text x="50%" y="85%" font-size="16" fill="white" text-anchor="middle" font-family="Arial">${label}</text>
    </svg>
  `)}`;
};

export const mockPatients: Patient[] = [
  {
    id: 'mock-patient-1',
    name: 'Maria Silva Santos',
    cpf: '123.456.789-01',
    birthDate: '1978-03-15',
    examDate: '2024-11-15',
    location: 'UPA Central - São Paulo',
    technicianName: 'Carlos Mendes',
    status: 'pending',
    createdAt: '2024-11-15T09:30:00.000Z',
    images: [
      {
        id: 'img-1-1',
        data: createMockImage('#0a5ea7', 'Retinografia OD - Maria Silva'),
        fileName: 'retinografia-od-maria.jpg',
        uploadedAt: '2024-11-15T09:30:00.000Z',
      },
      {
        id: 'img-1-2',
        data: createMockImage('#0284c7', 'Retinografia OE - Maria Silva'),
        fileName: 'retinografia-oe-maria.jpg',
        uploadedAt: '2024-11-15T09:30:00.000Z',
      },
      {
        id: 'img-1-3',
        data: createMockImage('#0369a1', 'Campo Visual - Maria Silva'),
        fileName: 'campo-visual-maria.jpg',
        uploadedAt: '2024-11-15T09:30:00.000Z',
      },
    ],
  },
  {
    id: 'mock-patient-2',
    name: 'João Pedro Oliveira',
    cpf: '987.654.321-02',
    birthDate: '1965-08-22',
    examDate: '2024-11-16',
    location: 'Hospital Santa Casa - Rio de Janeiro',
    technicianName: 'Ana Paula Costa',
    status: 'pending',
    createdAt: '2024-11-16T10:15:00.000Z',
    images: [
      {
        id: 'img-2-1',
        data: createMockImage('#059669', 'Retinografia OD - João Pedro'),
        fileName: 'retinografia-od-joao.jpg',
        uploadedAt: '2024-11-16T10:15:00.000Z',
      },
      {
        id: 'img-2-2',
        data: createMockImage('#10b981', 'Retinografia OE - João Pedro'),
        fileName: 'retinografia-oe-joao.jpg',
        uploadedAt: '2024-11-16T10:15:00.000Z',
      },
      {
        id: 'img-2-3',
        data: createMockImage('#34d399', 'OCT - João Pedro'),
        fileName: 'oct-joao.jpg',
        uploadedAt: '2024-11-16T10:15:00.000Z',
      },
    ],
  },
  {
    id: 'mock-patient-3',
    name: 'Ana Carolina Ferreira',
    cpf: '456.789.123-03',
    birthDate: '1990-12-05',
    examDate: '2024-11-17',
    location: 'Clínica Oftalmológica Visão - Belo Horizonte',
    technicianName: 'Roberto Lima',
    status: 'pending',
    createdAt: '2024-11-17T14:20:00.000Z',
    images: [
      {
        id: 'img-3-1',
        data: createMockImage('#7c3aed', 'Retinografia OD - Ana Carolina'),
        fileName: 'retinografia-od-ana.jpg',
        uploadedAt: '2024-11-17T14:20:00.000Z',
      },
      {
        id: 'img-3-2',
        data: createMockImage('#8b5cf6', 'Retinografia OE - Ana Carolina'),
        fileName: 'retinografia-oe-ana.jpg',
        uploadedAt: '2024-11-17T14:20:00.000Z',
      },
      {
        id: 'img-3-3',
        data: createMockImage('#a78bfa', 'Angiografia - Ana Carolina'),
        fileName: 'angiografia-ana.jpg',
        uploadedAt: '2024-11-17T14:20:00.000Z',
      },
    ],
  },
  {
    id: 'mock-patient-4',
    name: 'Roberto Carlos Almeida',
    cpf: '321.654.987-04',
    birthDate: '1955-06-30',
    examDate: '2024-11-18',
    location: 'UPA Norte - Brasília',
    technicianName: 'Fernanda Souza',
    status: 'pending',
    createdAt: '2024-11-18T08:45:00.000Z',
    images: [
      {
        id: 'img-4-1',
        data: createMockImage('#dc2626', 'Retinografia OD - Roberto Carlos'),
        fileName: 'retinografia-od-roberto.jpg',
        uploadedAt: '2024-11-18T08:45:00.000Z',
      },
      {
        id: 'img-4-2',
        data: createMockImage('#ef4444', 'Retinografia OE - Roberto Carlos'),
        fileName: 'retinografia-oe-roberto.jpg',
        uploadedAt: '2024-11-18T08:45:00.000Z',
      },
      {
        id: 'img-4-3',
        data: createMockImage('#f87171', 'Topografia - Roberto Carlos'),
        fileName: 'topografia-roberto.jpg',
        uploadedAt: '2024-11-18T08:45:00.000Z',
      },
    ],
  },
];
