'use client';

import { useEffect, useState } from 'react';
import { Users, Image as LucideImage, Clock, CheckCircle2, TrendingUp, TrendingDown, Activity, RefreshCw } from 'lucide-react';
import Navbar from '@/components/Navbar';
import { getAnalytics, getPatients } from '@/lib/storage';
import { AnalyticsData } from '@/types';

export default function Analytics() {
  const [analytics, setAnalytics] = useState<AnalyticsData>({
    totalPatients: 0,
    totalImages: 0,
    pendingReports: 0,
    completedReports: 0,
    patientsToday: 0,
    imagesToday: 0,
    averageProcessingTime: 0,
  });

  const [recentActivity, setRecentActivity] = useState<any[]>([]);

  useEffect(() => {
    loadAnalytics();
  }, []);

  const loadAnalytics = () => {
    const data = getAnalytics();
    setAnalytics(data);

    const patients = getPatients();
    const recent = patients
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5);
    setRecentActivity(recent);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusBadge = (status: string) => {
    const styles = {
      pending: 'bg-cardinal-50 text-cardinal-700 border border-cardinal-100',
      in_analysis: 'bg-blue-50 text-blue-700 border border-blue-100',
      completed: 'bg-green-50 text-green-700 border border-green-100',
    };

    const labels = {
      pending: 'Pendente',
      in_analysis: 'Em Análise',
      completed: 'Concluído',
    };

    return (
      <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${styles[status as keyof typeof styles]}`}>
        {labels[status as keyof typeof labels]}
      </span>
    );
  };

  const StatCard = ({ title, value, icon: Icon, subtitle, trend }: any) => (
    <div className="premium-card p-8 group overflow-hidden relative">
      <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
        <Icon className="w-20 h-20 text-cardinal-700" />
      </div>
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-6">
          <div className="p-3 bg-cardinal-50 rounded-xl text-cardinal-700 group-hover:scale-110 transition-transform duration-500">
            <Icon className="h-6 w-6" />
          </div>
          {trend && (
            <div className={`flex items-center text-sm font-bold ${trend > 0 ? 'text-green-600' : 'text-cardinal-600'}`}>
              {trend > 0 ? <TrendingUp className="h-4 w-4 mr-1" /> : <TrendingDown className="h-4 w-4 mr-1" />}
              {Math.abs(trend)}%
            </div>
          )}
        </div>
        <h3 className="text-4xl font-serif font-bold text-charcoal mb-1">{value}</h3>
        <p className="text-sm font-bold uppercase tracking-widest text-sandstone-500">{title}</p>
        {subtitle && <p className="text-xs text-sandstone-400 mt-2 font-medium italic">{subtitle}</p>}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen relative overflow-hidden">
      <div className="noise-overlay" />
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-20">
        <div className="stagger-load space-y-12">
          {/* Header */}
          <div className="max-w-2xl">
            <div className="accent-line" />
            <h1 className="text-4xl md:text-5xl font-serif font-bold text-charcoal mb-6 leading-[1.1]">
              Dashboard de <span className="text-cardinal-700 italic">Analytics</span>
            </h1>
            <p className="text-lg text-sandstone-600 font-medium">
              Métricas detalhadas e performance operacional da rede neuroftalmológica.
            </p>
          </div>

          {/* Statistics Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            <StatCard
              title="Total de Pacientes"
              value={analytics.totalPatients}
              icon={Users}
              subtitle={`${analytics.patientsToday} novos registros hoje`}
              trend={analytics.patientsToday > 0 ? 12 : 0}
            />

            <StatCard
              title="Total de Imagens"
              value={analytics.totalImages}
              icon={LucideImage}
              subtitle={`${analytics.imagesToday} sincronizadas hoje`}
              trend={analytics.imagesToday > 0 ? 8 : 0}
            />

            <StatCard
              title="Laudos Pendentes"
              value={analytics.pendingReports}
              icon={Clock}
              subtitle="Prioridade de análise"
            />

            <StatCard
              title="Laudos Concluídos"
              value={analytics.completedReports}
              icon={CheckCircle2}
              subtitle="Eficiência operacional"
              trend={5}
            />
          </div>

          {/* Middle Section */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="premium-card p-8 lg:col-span-1 border-l-4 border-l-cardinal-700">
              <div className="flex items-center space-x-3 mb-8">
                <Activity className="h-6 w-6 text-cardinal-700" />
                <h3 className="text-xl font-serif font-bold text-charcoal">Processing Performance</h3>
              </div>
              <div className="flex flex-col items-center justify-center py-6">
                <div className="relative">
                  <div className="text-6xl font-serif font-bold text-cardinal-700">
                    {analytics.averageProcessingTime.toFixed(1)}<span className="text-2xl ml-1 text-sandstone-400 font-sans">h</span>
                  </div>
                </div>
                <p className="text-sm font-bold uppercase tracking-wider text-sandstone-500 mt-6 text-center">
                  Média de Tempo de Resposta
                </p>
              </div>
            </div>

            <div className="premium-card p-8 lg:col-span-2">
              <h3 className="text-xl font-serif font-bold text-charcoal mb-8">Distribuição de Status</h3>
              <div className="space-y-10">
                <div>
                  <div className="flex justify-between items-end mb-3">
                    <span className="text-sm font-bold uppercase tracking-widest text-sandstone-500">Processos Pendentes</span>
                    <span className="text-2xl font-serif font-bold text-charcoal">
                      {analytics.pendingReports} <span className="text-sm font-sans text-sandstone-400 ml-1">
                        ({analytics.totalPatients > 0 ? ((analytics.pendingReports / analytics.totalPatients) * 100).toFixed(1) : 0}%)
                      </span>
                    </span>
                  </div>
                  <div className="w-full bg-sandstone-100 rounded-full h-2.5 overflow-hidden">
                    <div
                      className="bg-cardinal-700 h-full rounded-full transition-all duration-1000 ease-out shadow-[0_0_15px_rgba(140,21,21,0.3)]"
                      style={{ width: `${analytics.totalPatients > 0 ? (analytics.pendingReports / analytics.totalPatients) * 100 : 0}%` }}
                    ></div>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-end mb-3">
                    <span className="text-sm font-bold uppercase tracking-widest text-sandstone-500">Conclusões Efetuadas</span>
                    <span className="text-2xl font-serif font-bold text-charcoal">
                      {analytics.completedReports} <span className="text-sm font-sans text-sandstone-400 ml-1">
                        ({analytics.totalPatients > 0 ? ((analytics.completedReports / analytics.totalPatients) * 100).toFixed(1) : 0}%)
                      </span>
                    </span>
                  </div>
                  <div className="w-full bg-sandstone-100 rounded-full h-2.5 overflow-hidden">
                    <div
                      className="bg-green-600 h-full rounded-full transition-all duration-1000 ease-out"
                      style={{ width: `${analytics.totalPatients > 0 ? (analytics.completedReports / analytics.totalPatients) * 100 : 0}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Recent Activity Table */}
          <div className="premium-card overflow-hidden">
            <div className="p-8 border-b border-sandstone-100 flex justify-between items-center">
              <h3 className="text-xl font-serif font-bold text-charcoal italic">Atividade Recente</h3>
              <button
                onClick={loadAnalytics}
                className="p-2 hover:bg-sandstone-50 rounded-lg transition-colors group"
              >
                <RefreshCw className="w-5 h-5 text-sandstone-400 group-hover:rotate-180 transition-transform duration-700" />
              </button>
            </div>
            <div className="overflow-x-auto">
              {recentActivity.length === 0 ? (
                <div className="text-center py-20 bg-sandstone-50/30">
                  <Users className="mx-auto h-16 w-16 text-sandstone-200" />
                  <p className="mt-4 text-xl font-serif text-sandstone-400">Nenhum registro encontrado</p>
                </div>
              ) : (
                <table className="min-w-full">
                  <thead>
                    <tr className="bg-sandstone-50/50">
                      <th className="px-8 py-4 text-left text-xs font-bold text-sandstone-500 uppercase tracking-widest border-b border-sandstone-100">
                        Paciente
                      </th>
                      <th className="px-8 py-4 text-left text-xs font-bold text-sandstone-500 uppercase tracking-widest border-b border-sandstone-100 outline-none">
                        Documento
                      </th>
                      <th className="px-8 py-4 text-left text-xs font-bold text-sandstone-500 uppercase tracking-widest border-b border-sandstone-100">
                        Data Exame
                      </th>
                      <th className="px-8 py-4 text-left text-xs font-bold text-sandstone-500 uppercase tracking-widest border-b border-sandstone-100">
                        Status
                      </th>
                      <th className="px-8 py-4 text-right text-xs font-bold text-sandstone-500 uppercase tracking-widest border-b border-sandstone-100">
                        Registro
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-sandstone-100">
                    {recentActivity.map((patient) => (
                      <tr key={patient.id} className="group hover:bg-cardinal-50/20 transition-colors">
                        <td className="px-8 py-6">
                          <div className="text-sm font-bold text-charcoal">{patient.name}</div>
                          <div className="text-xs text-sandstone-400 italic mt-0.5">{patient.location}</div>
                        </td>
                        <td className="px-8 py-6 text-sm font-medium text-sandstone-600">
                          {patient.cpf}
                        </td>
                        <td className="px-8 py-6 text-sm font-medium text-sandstone-600">
                          {new Date(patient.examDate).toLocaleDateString('pt-BR')}
                        </td>
                        <td className="px-8 py-6">
                          {getStatusBadge(patient.status)}
                        </td>
                        <td className="px-8 py-6 text-right text-xs font-medium text-sandstone-400">
                          {formatDate(patient.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

