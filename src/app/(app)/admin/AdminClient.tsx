'use client';

import { useState } from 'react';
import { Trash2, Users, ShieldCheck } from 'lucide-react';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';

type User = {
  id: string;
  email: string;
  full_name: string;
  created_at: string;
};

type Props = {
  users: User[];
  currentUserId: string;
};

export default function AdminClient({ users: initial, currentUserId }: Props) {
  const [users, setUsers] = useState(initial);
  const [toDelete, setToDelete] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleDelete() {
    if (!toDelete) return;
    setLoading(true);
    setError('');

    try {
      const res = await fetch(`/api/admin/users?id=${toDelete.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? 'Erro ao excluir.');
        return;
      }
      setUsers((prev) => prev.filter((u) => u.id !== toDelete.id));
      setToDelete(null);
    } catch {
      setError('Erro ao excluir. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  function getInitials(name: string) {
    return name
      .split(' ')
      .map((n) => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  return (
    <div className="pt-6 pb-4">
      <div className="flex items-center gap-3 mb-6">
        <div className="h-10 w-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
          <ShieldCheck className="text-emerald-400" size={20} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-zinc-100">Gerenciar Usuários</h1>
          <p className="text-sm text-zinc-500">
            {users.length} conta{users.length !== 1 ? 's' : ''} cadastrada{users.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {users.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Users size={40} className="text-zinc-700 mb-3" />
          <p className="text-zinc-500 text-sm">Nenhum usuário cadastrado.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {users.map((user) => (
            <div
              key={user.id}
              className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-2xl p-4"
            >
              <div className="h-10 w-10 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center flex-shrink-0">
                <span className="text-sm font-semibold text-emerald-400">
                  {getInitials(user.full_name || user.email)}
                </span>
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-zinc-100 truncate">
                  {user.full_name || '—'}
                </p>
                <p className="text-xs text-zinc-500 truncate">{user.email}</p>
                <p className="text-xs text-zinc-600 mt-0.5">{formatDate(user.created_at)}</p>
              </div>

              {user.id === currentUserId ? (
                <span className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded-lg flex-shrink-0">
                  Você
                </span>
              ) : (
                <button
                  onClick={() => setToDelete(user)}
                  className="h-9 w-9 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 hover:bg-red-500/20 transition-colors flex-shrink-0"
                  aria-label={`Excluir ${user.full_name}`}
                >
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal
        open={!!toDelete}
        onClose={() => {
          setToDelete(null);
          setError('');
        }}
        title="Excluir usuário"
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-zinc-400">
            Tem certeza que deseja excluir{' '}
            <span className="font-medium text-zinc-100">{toDelete?.full_name}</span>?
            <br />
            <span className="text-zinc-600">{toDelete?.email}</span>
          </p>
          <p className="text-xs text-zinc-500 bg-zinc-800 rounded-xl px-3 py-2">
            Todos os dados serão removidos permanentemente — refeições, peso, água e histórico.
          </p>

          {error && (
            <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex gap-2">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => {
                setToDelete(null);
                setError('');
              }}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button
              variant="danger"
              className="flex-1"
              loading={loading}
              onClick={handleDelete}
            >
              Excluir
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
