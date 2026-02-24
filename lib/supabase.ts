import { createClient } from '@supabase/supabase-js';
import { ProGrowthClient, ProGrowthPhase } from '../types';

const supabaseUrl = 'https://mdzfsfeagqtlimgenzso.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1kemZzZmVhZ3F0bGltZ2VuenNvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA0NjI5NjIsImV4cCI6MjA4NjAzODk2Mn0.2NlCcuLl9dGBfnfLt3D8A6rZyuCfOCMWYHWskOyyse0';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// --- ProGrowth Client CRUD ---

const mapRowToClient = (row: any): ProGrowthClient => ({
  id: row.id,
  userId: row.user_id,
  name: row.name,
  phase: row.phase === 1 ? 1 : row.phase === 2 ? 2 : 'complete' as ProGrowthPhase,
  phase1Document: row.phase1_document ?? undefined,
  phase2Document: row.phase2_document ?? undefined,
  finalDocument: row.final_document ?? undefined,
  createdAt: new Date(row.created_at).getTime(),
  updatedAt: new Date(row.updated_at).getTime(),
});

export const loadProGrowthClients = async (userId: string): Promise<ProGrowthClient[]> => {
  const { data, error } = await supabase
    .from('progrowth_clients')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Erro ao carregar clientes ProGrowth:', error);
    return [];
  }

  return (data || []).map(mapRowToClient);
};

export const createProGrowthClient = async (userId: string, name: string): Promise<ProGrowthClient> => {
  const { data, error } = await supabase
    .from('progrowth_clients')
    .insert({ user_id: userId, name, phase: 1 })
    .select()
    .single();

  if (error) {
    console.error('Erro ao criar cliente ProGrowth:', error);
    throw error;
  }

  return mapRowToClient(data);
};

export const updateProGrowthClient = async (id: string, updates: Partial<ProGrowthClient>): Promise<void> => {
  const dbUpdates: Record<string, any> = { updated_at: new Date().toISOString() };

  if (updates.name !== undefined) dbUpdates.name = updates.name;
  if (updates.phase !== undefined) dbUpdates.phase = updates.phase === 'complete' ? 3 : updates.phase;
  if (updates.phase1Document !== undefined) dbUpdates.phase1_document = updates.phase1Document;
  if (updates.phase2Document !== undefined) dbUpdates.phase2_document = updates.phase2Document;
  if (updates.finalDocument !== undefined) dbUpdates.final_document = updates.finalDocument;

  const { error } = await supabase
    .from('progrowth_clients')
    .update(dbUpdates)
    .eq('id', id);

  if (error) {
    console.error('Erro ao atualizar cliente ProGrowth:', error);
    throw error;
  }
};

export const deleteProGrowthClient = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('progrowth_clients')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Erro ao excluir cliente ProGrowth:', error);
    throw error;
  }
};
