import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  // O id agora é o examId
  const exam = await prisma.exam.findUnique({
    where: { id: params.id },
    include: {
      patient: true,
      images: true,
      report: true,
      referral: true,
    },
  });

  if (!exam || !exam.report) {
    return new NextResponse('Report not found', { status: 404 });
  }

  const patient = exam.patient;

  const formatCPF = (cpf: string | null) => {
    if (!cpf) return '---';
    return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  };

  const formatDate = (date: any) => {
    if (!date) return '--/--/----';
    return format(new Date(date), 'dd/MM/yyyy', { locale: ptBR });
  };

  const findings = JSON.parse(exam.report.findings || '{}');
  const conditions = exam.report.diagnosticConditions as any;

  // Standalone HTML for Puppeteer
  const html = `
    <!DOCTYPE html>
    <html lang="pt-br">
    <head>
      <meta charset="UTF-8">
      <title>Relatório - ${patient.name}</title>
      <script src="https://cdn.tailwindcss.com"></script>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Playfair+Display:ital,wght@0,700;1,700&display=swap" rel="stylesheet">
      <style>
        body { font-family: 'Inter', sans-serif; }
        .font-serif { font-family: 'Playfair Display', serif; }
        @media print {
          .no-print { display: none; }
          body { -webkit-print-color-adjust: exact; }
        }
      </style>
    </head>
    <body class="bg-white p-10">
      <div class="max-w-4xl mx-auto space-y-8">
        <!-- Header -->
        <div class="text-center space-y-3 border-b-4 border-[#8B0000] pb-6">
          <h1 class="text-3xl font-serif font-bold text-gray-900 uppercase tracking-tight">Relatório Oftalmológico</h1>
          <p class="text-[10px] font-bold uppercase tracking-[0.3em] text-gray-400">Certificação Digital NeuroApp #${exam.report.id.slice(-8).toUpperCase()}</p>
        </div>

        <!-- Meta -->
        <div class="bg-gray-50 p-6 rounded-xl border border-gray-100 grid grid-cols-2 md:grid-cols-4 gap-6">
          <div>
            <p class="text-[9px] font-bold text-gray-400 uppercase">Paciente</p>
            <p class="text-sm font-bold text-gray-900">${patient.name}</p>
          </div>
          <div>
            <p class="text-[9px] font-bold text-gray-400 uppercase">CPF</p>
            <p class="text-sm font-bold text-gray-900">${formatCPF(patient.cpf)}</p>
          </div>
          <div>
            <p class="text-[9px] font-bold text-gray-400 uppercase">Nascimento</p>
            <p class="text-sm font-bold text-gray-900">${formatDate(patient.birthDate)}</p>
          </div>
          <div>
            <p class="text-[9px] font-bold text-gray-400 uppercase">Data do Exame</p>
            <p class="text-sm font-bold text-gray-900">${formatDate(exam.examDate)}</p>
          </div>
          <div class="col-span-2">
            <p class="text-[9px] font-bold text-gray-400 uppercase">Localidade</p>
            <p class="text-sm font-bold text-gray-900">${exam.location}</p>
          </div>
          <div class="col-span-2 text-right">
            <p class="text-[9px] font-bold text-gray-400 uppercase">Assinado em</p>
            <p class="text-sm font-serif font-bold italic text-gray-900">${formatDate(exam.report.completedAt)}</p>
          </div>
        </div>

        <!-- Images -->
        <div class="grid grid-cols-2 gap-4">
          ${params.id && exam.images.filter(img => img.id === (exam.report as any).selectedImages?.od || img.id === (exam.report as any).selectedImages?.oe).length > 0
      ? exam.images.filter(img => img.id === (exam.report as any).selectedImages?.od || img.id === (exam.report as any).selectedImages?.oe).map(img => `
              <div class="border rounded-lg overflow-hidden p-2 bg-gray-50">
                <img src="${img.url}" class="w-full aspect-[4/3] object-cover rounded shadow-inner" />
                <p class="text-[8px] font-bold text-gray-400 uppercase mt-2 text-center">${img.id === (exam.report as any).selectedImages?.od ? 'Olho Direito (OD)' : 'Olho Esquerdo (OE)'}</p>
              </div>
            `).join('')
      : exam.images.slice(0, 2).map((img, i) => `
              <div class="border rounded-lg overflow-hidden p-2 bg-gray-50">
                <img src="${img.url}" class="w-full aspect-[4/3] object-cover rounded shadow-inner" />
                <p class="text-[8px] font-bold text-gray-400 uppercase mt-2 text-center">Captura ${i + 1}</p>
              </div>
            `).join('')
    }
        </div>

        <!-- Findings -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-10">
          <div class="lg:col-span-1 space-y-4">
             <h3 class="text-sm font-serif font-bold border-b pb-1">Condições</h3>
             <div class="flex flex-wrap gap-2">
                ${conditions.normal ? '<span class="px-2 py-0.5 bg-green-50 text-green-700 border border-green-200 text-[8px] font-bold rounded">NORMAL</span>' : ''}
                ${conditions.drMild ? '<span class="px-2 py-0.5 bg-red-50 text-red-700 border border-red-200 text-[8px] font-bold rounded">RD LEVE</span>' : ''}
                ${conditions.drModerate ? '<span class="px-2 py-0.5 bg-red-50 text-red-700 border border-red-200 text-[8px] font-bold rounded">RD MODERADA</span>' : ''}
                ${conditions.drSevere ? '<span class="px-2 py-0.5 bg-red-50 text-red-700 border border-red-200 text-[8px] font-bold rounded">RD GRAVE</span>' : ''}
                ${conditions.drProliferative ? '<span class="px-2 py-0.5 bg-red-900 text-white text-[8px] font-bold rounded">RD PROLIFERATIVA</span>' : ''}
                ${conditions.glaucomaSuspect ? '<span class="px-2 py-0.5 bg-red-50 text-red-700 border border-red-200 text-[8px] font-bold rounded">SUSPEITA GLAUCOMA</span>' : ''}
                ${conditions.hrMild ? '<span class="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 text-[8px] font-bold rounded">RH LEVE</span>' : ''}
                ${conditions.hrModerate ? '<span class="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 text-[8px] font-bold rounded">RH MODERADA</span>' : ''}
                ${conditions.hrSevere ? '<span class="px-2 py-0.5 bg-blue-900 text-white text-[8px] font-bold rounded">RH GRAVE</span>' : ''}
             </div>
          </div>
          <div class="lg:col-span-2 space-y-6">
             <section>
               <h4 class="text-[9px] font-bold text-gray-400 uppercase border-b mb-3 pb-1">Achados Clínicos</h4>
               <div class="grid grid-cols-2 gap-6">
                 <div>
                   <h5 class="text-[10px] font-bold text-[#8B0000] mb-2 uppercase italic border-b border-red-100">Olho Direito</h5>
                   <p class="text-xs text-gray-400 font-bold uppercase text-[8px]">Nervo</p>
                   <p class="text-xs mb-2 italic">"${findings.od?.opticNerve || '-'}"</p>
                   <p class="text-xs text-gray-400 font-bold uppercase text-[8px]">Retina</p>
                   <p class="text-xs mb-2 italic">"${findings.od?.retina || '-'}"</p>
                   <p class="text-xs text-gray-400 font-bold uppercase text-[8px]">Vasos</p>
                   <p class="text-xs italic">"${findings.od?.vessels || '-'}"</p>
                 </div>
                 <div>
                   <h5 class="text-[10px] font-bold text-[#8B0000] mb-2 uppercase italic border-b border-red-100">Olho Esquerdo</h5>
                   <p class="text-xs text-gray-400 font-bold uppercase text-[8px]">Nervo</p>
                   <p class="text-xs mb-2 italic">"${findings.oe?.opticNerve || '-'}"</p>
                   <p class="text-xs text-gray-400 font-bold uppercase text-[8px]">Retina</p>
                   <p class="text-xs mb-2 italic">"${findings.oe?.retina || '-'}"</p>
                   <p class="text-xs text-gray-400 font-bold uppercase text-[8px]">Vasos</p>
                   <p class="text-xs italic">"${findings.oe?.vessels || '-'}"</p>
                 </div>
               </div>
             </section>
             <section>
               <h4 class="text-[9px] font-bold text-gray-400 uppercase border-b mb-3 pb-1">Conclusão & Conduta</h4>
               <p class="text-sm font-serif font-bold italic text-gray-900 leading-relaxed mb-4">${exam.report.diagnosis}</p>
               <div class="bg-gray-50 p-4 rounded-lg border italic text-xs text-gray-600">
                 <strong>Conduta:</strong> ${exam.report.suggestedConduct || '-'}
               </div>
             </section>
          </div>
        </div>

        <div class="pt-10 border-t flex justify-between items-end">
          <div class="text-[10px] text-gray-400">
             <p>Este documento é assinado digitalmente.</p>
             <p>Acesse o portal para validação via QR Code.</p>
          </div>
          <div class="text-right">
             <p class="text-xs font-serif font-bold italic text-gray-900 underline decoration-[#8B0000]">${exam.report.doctorName}</p>
             <p class="text-[9px] font-bold text-gray-400 uppercase">CRM: ${exam.report.doctorCRM || 'CRM-SP 177.943'}</p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html' },
  });
}
