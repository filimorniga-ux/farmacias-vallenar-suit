'use client';

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { LandingPageContent } from './LandingPageContent';

const LandingPage: React.FC = () => {
    const navigate = useNavigate();

    return <LandingPageContent navigateTo={navigate} />;
};

export default LandingPage;
