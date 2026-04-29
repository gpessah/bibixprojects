import { useEffect, useState } from 'react';
import { Users, FormInput, BarChart2, Settings2, UserSquare2, Key } from 'lucide-react';
import { useCRMStore, type CRMContact } from '../store/crmStore';
import ContactsTable from '../components/crm/ContactsTable';
import ContactDetailModal from '../components/crm/ContactDetailModal';
import FieldManager from '../components/crm/FieldManager';
import FormBuilder from '../components/crm/FormBuilder';
import ReportsPanel from '../components/crm/ReportsPanel';
import TeamsManager from '../components/crm/TeamsManager';
import ContactModal from '../components/crm/ContactModal';
import APIKeysPanel from '../components/crm/APIKeysPanel';

type Tab = 'contacts' | 'teams' | 'forms' | 'reports' | 'fields' | 'api';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'contacts', label: 'Contacts', icon: <Users size={15} />        },
  { id: 'teams',    label: 'Teams',    icon: <UserSquare2 size={15} />  },
  { id: 'forms',    label: 'Forms',    icon: <FormInput size={15} />    },
  { id: 'reports',  label: 'Reports',  icon: <BarChart2 size={15} />    },
  { id: 'fields',   label: 'Fields',   icon: <Settings2 size={15} />    },
  { id: 'api',      label: 'API',      icon: <Key size={15} />          },
];

export default function CRMPage() {
  const [tab, setTab] = useState<Tab>('contacts');
  const [openContactId, setOpenContactId] = useState<string | null>(null);
  const [showNewContact, setShowNewContact] = useState(false);
  const { loadFields, loadContacts, loadForms, loadCRMUsers, fields } = useCRMStore();

  useEffect(() => {
    loadFields();
    loadContacts();
    loadForms();
    loadCRMUsers();
  }, []);

  const handleOpenContact = (contact: CRMContact) => {
    setOpenContactId(contact.id);
  };

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Page header */}
      <div className="bg-white border-b border-gray-200 px-8 pt-6 pb-0 flex-shrink-0">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center">
            <Users size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">CRM</h1>
            <p className="text-xs text-gray-500">Contacts, teams, forms and pipeline</p>
          </div>
        </div>

        <div className="flex gap-1">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={[
                'flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition-colors',
                tab === t.id
                  ? 'border-blue-600 text-blue-600 bg-blue-50/50'
                  : 'border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-50',
              ].join(' ')}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className={`flex-1 overflow-hidden ${tab === 'contacts' ? '' : 'overflow-y-auto'}`}>
        {tab === 'contacts' && (
          <ContactsTable
            onOpenContact={handleOpenContact}
            onNewContact={() => setShowNewContact(true)}
          />
        )}
        {tab === 'teams'   && <TeamsManager />}
        {tab === 'fields'  && (
          <div className="p-8">
            <FieldManager />
          </div>
        )}
        {tab === 'forms'   && (
          <div className="p-8">
            <FormBuilder />
          </div>
        )}
        {tab === 'reports' && (
          <div className="p-8">
            <ReportsPanel />
          </div>
        )}
        {tab === 'api' && (
          <div className="p-8 max-w-3xl">
            <APIKeysPanel />
          </div>
        )}
      </div>

      {/* Contact detail drawer */}
      {openContactId && (
        <ContactDetailModal
          contactId={openContactId}
          onClose={() => setOpenContactId(null)}
          onUpdated={() => loadContacts()}
        />
      )}

      {/* New contact modal */}
      {showNewContact && (
        <ContactModal
          fields={fields}
          onClose={() => { setShowNewContact(false); loadContacts(); }}
        />
      )}
    </div>
  );
}
