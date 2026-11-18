'use client';

import { useState } from 'react';
import { PageHeader, Tabs } from '@globalantic/ui';
import { FraudPanel, OverviewPanel, ReferralAuditPanel, RegistrationsPanel, RewardsPanel, SettingsPanel } from './panels';
import { CodesPanel } from './CodesPanel';

type Tab = 'overview' | 'settings' | 'rewards' | 'codes' | 'registrations' | 'fraud' | 'audit';

export default function ReferralsPage() {
  const [tab, setTab] = useState<Tab>('overview');
  return (
    <>
      <PageHeader title="Referral programme" description="Rewards are created only from verified payments. Amounts come from the settings below — never from students or the browser." />
      <Tabs<Tab>
        label="Referral sections"
        value={tab}
        onChange={setTab}
        items={[
          { value: 'overview', label: 'Overview' },
          { value: 'rewards', label: 'Rewards' },
          { value: 'codes', label: 'Codes' },
          { value: 'registrations', label: 'Referral history' },
          { value: 'fraud', label: 'Fraud reviews' },
          { value: 'settings', label: 'Settings' },
          { value: 'audit', label: 'Audit log' },
        ]}
      />
      {tab === 'overview' && <OverviewPanel />}
      {tab === 'settings' && <SettingsPanel />}
      {tab === 'rewards' && <RewardsPanel />}
      {tab === 'codes' && <CodesPanel />}
      {tab === 'registrations' && <RegistrationsPanel />}
      {tab === 'fraud' && <FraudPanel />}
      {tab === 'audit' && <ReferralAuditPanel />}
    </>
  );
}
