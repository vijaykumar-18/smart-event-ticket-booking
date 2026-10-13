import React, { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import api, { assetBaseUrl } from '../api/axios';

function TicketCard({ ticket }) {
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  const qrUrl = `${assetBaseUrl}${ticket.qr_code_url}`;

  const downloadTicket = async () => {
    setDownloading(true);
    setDownloadError('');
    try {
      const response = await fetch(qrUrl);
      if (!response.ok) throw new Error('Ticket image download failed.');
      const objectUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `${ticket.ticket_code}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch {
      setDownloadError('Unable to download this ticket.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <article className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center">
      <img
        src={qrUrl}
        alt={`QR code for ticket ${ticket.ticket_code}`}
        className="h-36 w-36 self-center rounded-lg border border-slate-200 bg-white p-2 sm:self-auto"
      />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">Digital ticket</p>
        <h2 className="mt-1 text-lg font-bold text-slate-900">{ticket.event?.title || 'Event ticket'}</h2>
        {ticket.event && (
          <>
            <p className="mt-1 text-sm text-slate-600">{ticket.event.venue}, {ticket.event.location}</p>
            <p className="text-sm text-slate-600">{new Date(ticket.event.event_date).toLocaleString()}</p>
          </>
        )}
        <p className="mt-3 break-all font-mono text-sm font-semibold text-slate-800">{ticket.ticket_code}</p>
        <button
          type="button"
          onClick={downloadTicket}
          disabled={downloading}
          className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-blue-600 hover:underline disabled:opacity-50"
        >
          <Download className="h-4 w-4" />
          {downloading ? 'Preparing download...' : 'Download QR ticket'}
        </button>
        {downloadError && <p role="alert" className="mt-2 text-xs text-rose-600">{downloadError}</p>}
      </div>
    </article>
  );
}

export default function Tickets() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/tickets/my-tickets')
      .then((response) => setTickets(response.data))
      .catch(() => setError('Unable to load your tickets. Please try again.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="py-20 text-center text-slate-500">Loading your tickets...</p>;

  return (
    <section className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-slate-900">Your tickets</h1>
      {error ? (
        <p role="alert" className="rounded-lg bg-rose-50 p-4 text-rose-700">{error}</p>
      ) : tickets.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">
          You don’t have any tickets yet.
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          {tickets.map((ticket) => <TicketCard key={ticket.id} ticket={ticket} />)}
        </div>
      )}
    </section>
  );
}