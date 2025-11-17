'use client';

import { useEffect, useState } from 'react';
import { Users, Image, Clock, CheckCircle2, TrendingUp, TrendingDown, Activity } from 'lucide-react';
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

    // Pegar pacientes recentes (últimos 5)
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
      pending: 'bg-yellow-100 text-yellow-800',
      in_analysis: 'bg-blue-100 text-blue-800',
      completed: 'bg-green-100 text-green-800',
    };

    const labels = {
      pending: 'Pendente',
      in_analysis: 'Em Análise',
      completed: 'Concluído',
    };

    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status as keyof typeof styles]}`}>
        {labels[status as keyof typeof labels]}
      </span>
    );
  };

  const StatCard = ({ title, value, icon: Icon, subtitle, trend }: any) => (
    <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
      <div className="flex items-center justify-between mb-2">
        <div className="p-2 bg-primary-100 rounded-lg">
          <Icon className="h-6 w-6 text-primary-600" />
        </div>
        {trend && (
          <div className={`flex items-center text-sm ${trend > 0 ? 'text-green-600' : 'text-red-600'}`}>
            {trend > 0 ? <TrendingUp className="h-4 w-4 mr-1" /> : <TrendingDown className="h-4 w-4 mr-1" />}
            {Math.abs(trend)}%
          </div>
        )}
      </div>
      <h3 className="text-2xl font-bold text-gray-900">{value}</h3>
      <p className="text-sm text-gray-600 mt-1">{title}</p>
      {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Dashboard de Analytics</h1>
          <p className="text-gray-600">Acompanhe as métricas e indicadores do sistema em tempo real</p>
        </div>

        {/* Cards de Estatísticas */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatCard
            title="Total de Pacientes"
            value={analytics.totalPatients}
            icon={Users}
            subtitle={`${analytics.patientsToday} novos hoje`}
            trend={analytics.patientsToday > 0 ? 12 : 0}
          />

          <StatCard
            title="Total de Imagens"
            value={analytics.totalImages}
            icon={Image}
            subtitle={`${analytics.imagesToday} enviadas hoje`}
            trend={analytics.imagesToday > 0 ? 8 : 0}
          />

          <StatCard
            title="Laudos Pendentes"
            value={analytics.pendingReports}
            icon={Clock}
            subtitle="Aguardando análise"
          />

          <StatCard
            title="Laudos Concluídos"
            value={analytics.completedReports}
            icon={CheckCircle2}
            subtitle="Total processado"
            trend={5}
          />
        </div>

        {/* Métricas Adicionais */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200 lg:col-span-1">
            <div className="flex items-center mb-4">
              <Activity className="h-6 w-6 text-primary-600 mr-2" />
              <h3 className="text-lg font-semibold text-gray-900">Tempo Médio de Processamento</h3>
            </div>
            <div className="text-center">
              <p className="text-4xl font-bold text-primary-600">
                {analytics.averageProcessingTime.toFixed(1)}h
              </p>
              <p className="text-sm text-gray-600 mt-2">Tempo médio entre registro e laudo</p>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200 lg:col-span-2">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Distribuição de Status</h3>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-sm text-gray-600">Pendentes</span>
                  <span className="text-sm font-medium text-gray-900">
                    {analytics.pendingReports} ({analytics.totalPatients > 0 ? ((analytics.pendingReports / analytics.totalPatients) * 100).toFixed(1) : 0}%)
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-yellow-500 h-2 rounded-full"
                    style={{ width: `${analytics.totalPatients > 0 ? (analytics.pendingReports / analytics.totalPatients) * 100 : 0}%` }}
                  ></div>
                </div>
              </div>

              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-sm text-gray-600">Concluídos</span>
                  <span className="text-sm font-medium text-gray-900">
                    {analytics.completedReports} ({analytics.totalPatients > 0 ? ((analytics.completedReports / analytics.totalPatients) * 100).toFixed(1) : 0}%)
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-green-500 h-2 rounded-full"
                    style={{ width: `${analytics.totalPatients > 0 ? (analytics.completedReports / analytics.totalPatients) * 100 : 0}%` }}
                  ></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Atividade Recente */}
        <div className="bg-white rounded-lg shadow-md border border-gray-200">
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Atividade Recente</h3>
          </div>
          <div className="p-6">
            {recentActivity.length === 0 ? (
              <div className="text-center py-8">
                <Users className="mx-auto h-12 w-12 text-gray-400" />
                <p className="mt-2 text-gray-600">Nenhum paciente registrado ainda</p>
                <p className="text-sm text-gray-500">Os pacientes registrados aparecerão aqui</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead>
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Paciente
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        CPF
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Data do Exame
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Imagens
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Registrado em
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {recentActivity.map((patient) => (
                      <tr key={patient.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">{patient.name}</div>
                          <div className="text-sm text-gray-500">{patient.location}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                          {patient.cpf}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                          {new Date(patient.examDate).toLocaleDateString('pt-BR')}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center text-sm text-gray-600">
                            <Image className="h-4 w-4 mr-1" />
                            {patient.images.length}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {getStatusBadge(patient.status)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                          {formatDate(patient.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Botão de Atualizar */}
        <div className="mt-6 flex justify-end">
          <button
            onClick={loadAnalytics}
            className="px-6 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
          >
            Atualizar Dados
          </button>
        </div>
      </main>
    </div>
  );
}
