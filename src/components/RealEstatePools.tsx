import React, { useState, useEffect } from "react";
import { 
  Building2, 
  MapPin, 
  Scale, 
  FileText, 
  Plus, 
  Trash2, 
  ShieldCheck, 
  AlertTriangle, 
  Percent, 
  Check, 
  ThumbsUp, 
  FileCheck, 
  Activity, 
  Coins, 
  Briefcase, 
  Clock, 
  HelpCircle, 
  Camera, 
  ChevronRight, 
  Users 
} from "lucide-react";
import { collection, onSnapshot, doc, setDoc, deleteDoc } from "firebase/firestore";
import { db } from "../firebase";
import { 
  Member, 
  DeveloperPartner, 
  PropertyListing, 
  PropertyMilestone, 
  RealEstatePool, 
  PoolContribution, 
  PoolDispute, 
  OwnershipCertificate 
} from "../types";

interface RealEstatePoolsProps {
  members: Member[];
  selectedGroupId: string;
  isMemberOnlyUrl: boolean;
}

export default function RealEstatePools({ members, selectedGroupId, isMemberOnlyUrl }: RealEstatePoolsProps) {
  // Mode toggle within this tab (for testing admin workflows if not on member only URL)
  const [isAdminView, setIsAdminView] = useState(!isMemberOnlyUrl);

  // Firestore collections states
  const [partners, setPartners] = useState<DeveloperPartner[]>([]);
  const [properties, setProperties] = useState<PropertyListing[]>([]);
  const [milestones, setMilestones] = useState<PropertyMilestone[]>([]);
  const [pools, setPools] = useState<RealEstatePool[]>([]);
  const [contributions, setContributions] = useState<PoolContribution[]>([]);
  const [disputes, setDisputes] = useState<PoolDispute[]>([]);
  const [certificates, setCertificates] = useState<OwnershipCertificate[]>([]);

  // Selected state
  const [selectedPoolId, setSelectedPoolId] = useState<string>("");
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("");

  // Input forms states
  // 1. Developer Partner Info
  const [devName, setDevName] = useState("");
  const [devContact, setDevContact] = useState("");
  const [devRelationship, setDevRelationship] = useState<"family" | "referral" | "external">("external");
  const [devIsVerified, setDevIsVerified] = useState(false);

  // 2. Property Listing Info
  const [propTitle, setPropTitle] = useState("");
  const [propLocation, setPropLocation] = useState("");
  const [propType, setPropType] = useState<"land" | "off-plan" | "completed">("off-plan");
  const [propPrice, setPropPrice] = useState("");
  const [propDevId, setPropDevId] = useState("");
  const [propTitleStatus, setPropTitleStatus] = useState("C of O");
  const [propLawyerVerified, setPropLawyerVerified] = useState(true);
  const [propSurveyReport, setPropSurveyReport] = useState("");
  const [propDocLink, setPropDocLink] = useState("");

  // 3. Milestone State
  const [milesTitle, setMilesTitle] = useState("");
  const [milesPct, setMilesPct] = useState(20);
  const [milesEvidence, setMilesEvidence] = useState("");

  // 4. Contribution State
  const [contribAmount, setContribAmount] = useState("");
  const [contribMemberId, setContribMemberId] = useState("");

  // 5. Dispute state
  const [disputeTitle, setDisputeTitle] = useState("");
  const [disputeDesc, setDisputeDesc] = useState("");

  // Loading indicator states
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Subscriptions
  useEffect(() => {
    const unsubPartners = onSnapshot(collection(db, "developer_partners"), (snap) => {
      const list: DeveloperPartner[] = [];
      snap.forEach(d => list.push(d.data() as DeveloperPartner));
      setPartners(list);
    });

    const unsubProperties = onSnapshot(collection(db, "properties"), (snap) => {
      const list: PropertyListing[] = [];
      snap.forEach(d => list.push(d.data() as PropertyListing));
      setProperties(list);
    });

    const unsubMilestones = onSnapshot(collection(db, "property_milestones"), (snap) => {
      const list: PropertyMilestone[] = [];
      snap.forEach(d => list.push(d.data() as PropertyMilestone));
      setMilestones(list);
    });

    const unsubPools = onSnapshot(collection(db, "real_estate_pools"), (snap) => {
      const list: RealEstatePool[] = [];
      snap.forEach(d => list.push(d.data() as RealEstatePool));
      setPools(list.filter(p => p.groupId === selectedGroupId));
    });

    const unsubContrib = onSnapshot(collection(db, "pool_contributions"), (snap) => {
      const list: PoolContribution[] = [];
      snap.forEach(d => list.push(d.data() as PoolContribution));
      setContributions(list);
    });

    const unsubDisputes = onSnapshot(collection(db, "pool_disputes"), (snap) => {
      const list: PoolDispute[] = [];
      snap.forEach(d => list.push(d.data() as PoolDispute));
      setDisputes(list);
    });

    const unsubCert = onSnapshot(collection(db, "ownership_certificates"), (snap) => {
      const list: OwnershipCertificate[] = [];
      snap.forEach(d => list.push(d.data() as OwnershipCertificate));
      setCertificates(list);
    });

    return () => {
      unsubPartners();
      unsubProperties();
      unsubMilestones();
      unsubPools();
      unsubContrib();
      unsubDisputes();
      unsubCert();
    };
  }, [selectedGroupId]);

  // Seed default Nigerian sample properties & Developer Partners if they are empty
  useEffect(() => {
    if (partners.length === 0 && !isSubmitting) {
      const seedPartners = async () => {
        const p1: DeveloperPartner = {
          id: "dev-brother",
          name: "Olaoye & Sons Real Estate Ltd",
          contactInfo: "+234 812 345 6789 • Lekki Phase 1, Lagos",
          relationship: "family",
          isVerified: true
        };
        const p2: DeveloperPartner = {
          id: "dev-partner2",
          name: "Megajoule Landmark Developers",
          contactInfo: "+234 905 987 6543 • Abuja FCT",
          relationship: "referral",
          isVerified: true
        };
        await setDoc(doc(db, "developer_partners", p1.id), p1);
        await setDoc(doc(db, "developer_partners", p2.id), p2);
      };
      seedPartners().catch(console.error);
    }

    if (properties.length === 0 && !isSubmitting) {
      const seedProperties = async () => {
        const prop1: PropertyListing = {
          id: "prop-lekki-offplan",
          developerPartnerId: "dev-brother",
          title: "The Lagoon Vista Heights - Premium Off-Plan Condo",
          location: "Block 14, Plot 9, Lekki Peninsula Scheme II, Lagos",
          type: "off-plan",
          totalPrice: 154000000,
          currency: "NGN",
          titleStatus: "Certificate of Occupancy (C of O)",
          lawyerVerified: true,
          surveyorReport: "Registered surveyor report dated June 2026. Certified non-encroachment border lines validated with Lagos State GIS portal.",
          documentLinks: ["https://example.com/legal/title_deed_draft.pdf"],
          status: "available"
        };
        const prop2: PropertyListing = {
          id: "prop-eko-atlantic",
          developerPartnerId: "dev-brother",
          title: "Eko Atlantic Reclamation Plot - Block B7",
          location: "District 2 Marina Zone, Eko Atlantic, Lagos",
          type: "land",
          totalPrice: 480000000,
          currency: "NGN",
          titleStatus: "Deed of Sub-Lease (Eko Atlantic Authority)",
          lawyerVerified: true,
          surveyorReport: "Eko Atlantic Surveyor Co-ownership Certificate #EAC-2026-991.",
          documentLinks: [],
          status: "available"
        };
        await setDoc(doc(db, "properties", prop1.id), prop1);
        await setDoc(doc(db, "properties", prop2.id), prop2);

        // Add default milestones for Vista Heights
        const m1: PropertyMilestone = {
          id: "mile-v1",
          propertyId: "prop-lekki-offplan",
          title: "Phase 1: Excavation, Piling, and Foundation Works complete",
          releasePercentage: 30,
          isVerified: true,
          evidenceUrl: "Sub-grade concrete survey & site compaction test sheet approved by Structural Engr. Kelechi Okafor.",
          status: "approved"
        };
        const m2: PropertyMilestone = {
          id: "mile-v2",
          propertyId: "prop-lekki-offplan",
          title: "Phase 2: Superstructure columns and structural framing up to 3rd floor",
          releasePercentage: 40,
          isVerified: false,
          evidenceUrl: "Pending independent engineering audit certificate upload.",
          status: "pending"
        };
        const m3: PropertyMilestone = {
          id: "mile-v3",
          propertyId: "prop-lekki-offplan",
          title: "Phase 3: Internal finishes, MEP piping, and external cladding",
          releasePercentage: 20,
          isVerified: false,
          evidenceUrl: "Not started.",
          status: "pending"
        };
        const m4: PropertyMilestone = {
          id: "mile-v4",
          propertyId: "prop-lekki-offplan",
          title: "Phase 4: Final painting, landscaping, and title deed handover",
          releasePercentage: 10,
          isVerified: false,
          evidenceUrl: "Not started.",
          status: "pending"
        };

        await setDoc(doc(db, "property_milestones", m1.id), m1);
        await setDoc(doc(db, "property_milestones", m2.id), m2);
        await setDoc(doc(db, "property_milestones", m3.id), m3);
        await setDoc(doc(db, "property_milestones", m4.id), m4);
      };
      seedProperties().catch(console.error);
    }
  }, [partners, properties]);

  // Ensure default active pool for Vista Heights exists in this group for demo
  useEffect(() => {
    if (pools.length === 0 && !isSubmitting && properties.length > 0) {
      const activeProp = properties.find(p => p.id === "prop-lekki-offplan") || properties[0];
      if (activeProp) {
        const seedPool = async () => {
          const poolId = `pool-${selectedGroupId}-${activeProp.id}`;
          const defaultPool: RealEstatePool = {
            id: poolId,
            groupId: selectedGroupId,
            propertyId: activeProp.id,
            targetAmount: activeProp.totalPrice,
            currency: activeProp.currency,
            deadline: "2026-12-31",
            escrowProvider: "UBA Trustee & Escrow Services Nigeria Ltd",
            escrowAccountNo: "1023998188",
            status: "active"
          };
          await setDoc(doc(db, "real_estate_pools", poolId), defaultPool);
          
          // Seed some baseline custom contributions from some members if we have any members
          if (members.length >= 2) {
            const c1: PoolContribution = {
              id: `contrib-seed-1-${selectedGroupId}`,
              poolId,
              memberId: members[0].id,
              amount: Math.floor(activeProp.totalPrice * 0.15), // 15% contribution
              currency: activeProp.currency,
              verified: true,
              date: new Date().toISOString()
            };
            const c2: PoolContribution = {
              id: `contrib-seed-2-${selectedGroupId}`,
              poolId,
              memberId: members[1].id,
              amount: Math.floor(activeProp.totalPrice * 0.20), // 20% contribution
              currency: activeProp.currency,
              verified: true,
              date: new Date().toISOString()
            };
            await setDoc(doc(db, "pool_contributions", c1.id), c1);
            await setDoc(doc(db, "pool_contributions", c2.id), c2);
          }
        };
        seedPool().catch(console.error);
      }
    }
  }, [pools, properties, members, selectedGroupId]);

  // Handler: Add Developer Partner
  const handleAddPartner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!devName || !devContact) return;
    setIsSubmitting(true);
    const newId = "dev-" + Date.now();
    const partner: DeveloperPartner = {
      id: newId,
      name: devName,
      contactInfo: devContact,
      relationship: devRelationship,
      isVerified: devIsVerified
    };
    try {
      await setDoc(doc(db, "developer_partners", newId), partner);
      setDevName("");
      setDevContact("");
      setDevRelationship("external");
      setDevIsVerified(false);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handler: Add Property Listing
  const handleAddProperty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!propTitle || !propLocation || !propPrice || !propDevId) return;
    setIsSubmitting(true);
    const newId = "prop-" + Date.now();
    const property: PropertyListing = {
      id: newId,
      developerPartnerId: propDevId,
      title: propTitle,
      location: propLocation,
      type: propType,
      totalPrice: Number(propPrice),
      currency: "NGN",
      titleStatus: propTitleStatus,
      lawyerVerified: propLawyerVerified,
      surveyorReport: propSurveyReport,
      documentLinks: propDocLink ? [propDocLink] : [],
      status: "available"
    };
    try {
      await setDoc(doc(db, "properties", newId), property);
      setPropTitle("");
      setPropLocation("");
      setPropType("off-plan");
      setPropPrice("");
      setPropTitleStatus("C of O");
      setPropLawyerVerified(true);
      setPropSurveyReport("");
      setPropDocLink("");
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handler: Add Milestone
  const handleAddMilestone = async (e: React.FormEvent, propertyId: string) => {
    e.preventDefault();
    if (!milesTitle || !milesPct) return;
    setIsSubmitting(true);
    const newId = "mile-" + Date.now();
    const milestone: PropertyMilestone = {
      id: newId,
      propertyId,
      title: milesTitle,
      releasePercentage: Number(milesPct),
      isVerified: false,
      evidenceUrl: milesEvidence || "No evidence uploaded yet.",
      status: "pending"
    };
    try {
      await setDoc(doc(db, "property_milestones", newId), milestone);
      setMilesTitle("");
      setMilesPct(20);
      setMilesEvidence("");
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handler: Approve / Verify Milestone (Admin only)
  const handleVerifyMilestone = async (milestoneId: string, isVerified: boolean) => {
    const target = milestones.find(m => m.id === milestoneId);
    if (!target) return;
    const updated: PropertyMilestone = {
      ...target,
      isVerified,
      status: isVerified ? "approved" : "pending"
    };
    await setDoc(doc(db, "property_milestones", milestoneId), updated);
  };

  // Handler: Launch Pooling Project for selected Group
  const handleLaunchPool = async (propertyId: string) => {
    const property = properties.find(p => p.id === propertyId);
    if (!property) return;
    setIsSubmitting(true);
    const poolId = `pool-${selectedGroupId}-${propertyId}`;
    const pool: RealEstatePool = {
      id: poolId,
      groupId: selectedGroupId,
      propertyId,
      targetAmount: property.totalPrice,
      currency: property.currency,
      deadline: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString().split("T")[0], // 180 days out
      escrowProvider: "UBA Trustee & Escrow Services Nigeria Ltd",
      escrowAccountNo: "1023998188",
      status: "active"
    };
    try {
      await setDoc(doc(db, "real_estate_pools", poolId), pool);
      setSelectedPoolId(poolId);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handler: Submit Contribution
  const handleAddContribution = async (e: React.FormEvent, poolId: string) => {
    e.preventDefault();
    if (!contribAmount || !contribMemberId) return;
    setIsSubmitting(true);
    const newId = "contrib-" + Date.now();
    const activePool = pools.find(p => p.id === poolId);
    if (!activePool) return;
    const contribution: PoolContribution = {
      id: newId,
      poolId,
      memberId: contribMemberId,
      amount: Number(contribAmount),
      currency: activePool.currency,
      verified: true, // Auto-verified in prototype simulation
      date: new Date().toISOString()
    };
    try {
      await setDoc(doc(db, "pool_contributions", newId), contribution);
      setContribAmount("");
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handler: File Dispute
  const handleFileDispute = async (e: React.FormEvent, poolId: string) => {
    e.preventDefault();
    if (!disputeTitle || !disputeDesc || members.length === 0) return;
    setIsSubmitting(true);
    const newId = "dispute-" + Date.now();
    const dispute: PoolDispute = {
      id: newId,
      poolId,
      memberId: members[0]?.id || "anonymous",
      title: disputeTitle,
      description: disputeDesc,
      status: "open",
      date: new Date().toISOString()
    };
    try {
      await setDoc(doc(db, "pool_disputes", newId), dispute);
      setDisputeTitle("");
      setDisputeDesc("");
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Help calculate pool percentages
  const getPoolTotalContribs = (poolId: string) => {
    return contributions
      .filter(c => c.poolId === poolId && c.verified)
      .reduce((sum, c) => sum + c.amount, 0);
  };

  const getMemberContribInPool = (poolId: string, memberId: string) => {
    return contributions
      .filter(c => c.poolId === poolId && c.memberId === memberId && c.verified)
      .reduce((sum, c) => sum + c.amount, 0);
  };

  // Format Large Currency labels correctly (Naira)
  const formatNaira = (amount: number) => {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      maximumFractionDigits: 0
    }).format(amount);
  };

  // Active Selected Pool Calculations
  const activePool = pools.find(p => p.id === selectedPoolId) || pools[0];
  const activeProperty = activePool ? properties.find(p => p.id === activePool.propertyId) : null;
  const activePropertyMilestones = activeProperty ? milestones.filter(m => m.propertyId === activeProperty.id) : [];

  return (
    <div className="space-y-6">
      
      {/* Dynamic Simulation Switcher Alert (Admin vs Member Mode) */}
      <div className="bg-slate-900 text-white rounded-2xl p-4 shadow-md flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="space-y-1">
          <span className="text-2xs font-extrabold px-2 py-0.5 bg-indigo-600 rounded-full text-white uppercase tracking-widest inline-block">
            Nigeria Co-Investment Suite
          </span>
          <h2 className="text-md font-bold flex items-center gap-2">
            <Building2 className="w-5 h-5 text-indigo-400" />
            Olaoye Real Estate Pool Systems
          </h2>
          <p className="text-xs text-slate-300">
            Switch views to test the Co-Ownership models. Pooled funds stay locked in UBA Trustee Escrow.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {!isMemberOnlyUrl && (
            <div className="bg-slate-800 rounded-xl p-1 flex">
              <button
                type="button"
                onClick={() => setIsAdminView(true)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  isAdminView ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Admin Control
              </button>
              <button
                type="button"
                onClick={() => setIsAdminView(false)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  !isAdminView ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Co-Owner / Member
              </button>
            </div>
          )}
          {isMemberOnlyUrl && (
            <span className="text-xs text-indigo-300 font-extrabold flex items-center gap-1.5 bg-indigo-500/20 px-3 py-1.5 rounded-xl border border-indigo-500/30">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              Secure Member Mode
            </span>
          )}
        </div>
      </div>

      {/* Nigerian SEC Crowdfunding Regulation Warning Banner */}
      <div className="bg-amber-50/70 border border-amber-200/60 rounded-2xl p-4 flex gap-3 text-amber-800">
        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5 animate-bounce-slow" />
        <div className="text-xs space-y-1">
          <span className="font-extrabold uppercase tracking-wide inline-block">Nigerian Regulatory Outlook (SEC Rules on Crowdfunding)</span>
          <p className="leading-relaxed text-amber-700 font-medium">
             pooling money collectively from retail investors to purchase real-world lands or buildings is subject to SEC Crowdfunding rules (Section 224 under the ISA). Unless structured as an authorized collective investment scheme (CIS), private placement with accredited co-partners, or handled strictly via an SEC-licensed crowdfunding portal with a licensed trust escrow bank, pooled models run strict regulatory compliance risks in Nigeria. 
          </p>
          <p className="text-amber-600 text-2xs italic font-bold">
            💡 Always execute and draft custom cooperative deeds of trust (using independent legal counsel) before initiating payouts.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* ========================================================================= */}
        {/* VIEW 1: ADMIN CONTROL CONSOLE                                             */}
        {/* ========================================================================= */}
        {isAdminView ? (
          <div className="lg:col-span-12 grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* BOX 1: Developer Partners Entry */}
            <div className="bg-white rounded-2xl border border-slate-200/70 p-5 space-y-4 shadow-sm">
              <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                  <Briefcase className="w-4 h-4 text-indigo-600" />
                  1. Developer Partners Registry
                </h3>
                <span className="text-2xs bg-slate-100 px-2 py-1 rounded-md text-slate-500 font-bold">
                  {partners.length} Logged
                </span>
              </div>

              {/* Developer partner entry list */}
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {partners.map(p => (
                  <div key={p.id} className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex justify-between items-center">
                    <div>
                      <p className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        {p.name}
                        {p.relationship === "family" && (
                          <span className="text-2xs bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded-full font-black uppercase">
                            Family (Brother)
                          </span>
                        )}
                        {p.relationship === "referral" && (
                          <span className="text-2xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded-full font-semibold">
                            Partner Referral
                          </span>
                        )}
                      </p>
                      <p className="text-3xs text-slate-400 font-medium">{p.contactInfo}</p>
                    </div>
                    {p.isVerified ? (
                      <span className="text-2xs font-extrabold text-emerald-600 flex items-center gap-1">
                        <ShieldCheck className="w-3.5 h-3.5" /> Checked
                      </span>
                    ) : (
                      <button
                        onClick={async () => {
                          await setDoc(doc(db, "developer_partners", p.id), { ...p, isVerified: true });
                        }}
                        className="text-3xs px-2 py-1 bg-indigo-50 border border-indigo-150 rounded-lg text-indigo-700 font-black"
                      >
                        Verify Partner
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Form to add partner */}
              <form onSubmit={handleAddPartner} className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-150/60">
                <h4 className="text-xs font-black text-slate-700 uppercase">Register Developer Partner</h4>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    required
                    placeholder="Company Name (e.g. Alao Ltd)"
                    value={devName}
                    onChange={(e) => setDevName(e.target.value)}
                    className="p-2 border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                  <input
                    type="text"
                    required
                    placeholder="Contact Info / Location"
                    value={devContact}
                    onChange={(e) => setDevContact(e.target.value)}
                    className="p-2 border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>
                <div className="flex gap-2 items-center justify-between">
                  <select
                    value={devRelationship}
                    onChange={(e: any) => setDevRelationship(e.target.value)}
                    className="p-2 border border-slate-200 rounded-lg text-xs font-bold"
                  >
                    <option value="family">Family Relationship</option>
                    <option value="referral">Referral business</option>
                    <option value="external">External / Independent</option>
                  </select>
                  <label className="flex items-center gap-1 text-2xs font-bold text-slate-600">
                    <input
                      type="checkbox"
                      checked={devIsVerified}
                      onChange={(e) => setDevIsVerified(e.target.checked)}
                      className="rounded"
                    />
                    Pre-Verified
                  </label>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-black"
                  >
                    Add Partner
                  </button>
                </div>
              </form>
            </div>

            {/* BOX 2: Property Listings Registry */}
            <div className="bg-white rounded-2xl border border-slate-200/70 p-5 space-y-4 shadow-sm">
              <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-indigo-600" />
                  2. Escrow Property Listings
                </h3>
                <span className="text-2xs bg-slate-100 px-2 py-1 rounded-md text-slate-500 font-bold">
                  {properties.length} Available
                </span>
              </div>

              {/* Listings table view */}
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {properties.map(pr => {
                  const partner = partners.find(p => p.id === pr.developerPartnerId);
                  const isSponsoringPool = pools.some(p => p.propertyId === pr.id);
                  return (
                    <div key={pr.id} className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex justify-between items-start">
                      <div>
                        <p className="text-xs font-bold text-slate-800">{pr.title}</p>
                        <p className="text-3xs text-slate-400 font-bold flex items-center gap-1 mt-0.5">
                          <MapPin className="w-2.5 h-2.5 text-indigo-500 shrink-0" /> {pr.location}
                        </p>
                        <p className="text-3xs text-slate-500 font-bold mt-1">
                          Price: <strong className="text-slate-800">{formatNaira(pr.totalPrice)}</strong> • 
                          Developer: <span className="text-indigo-600 font-black">{partner ? partner.name : "N/A"}</span>
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1.5">
                        <span className="text-2xs px-2 py-0.5 bg-indigo-50 border border-indigo-100 rounded-full font-bold text-indigo-700 capitalize shrink-0">
                          {pr.type}
                        </span>
                        {isSponsoringPool ? (
                          <span className="text-3xs font-black text-emerald-600 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded">
                            Pool Launched ✓
                          </span>
                        ) : (
                          <button
                            onClick={() => handleLaunchPool(pr.id)}
                            className="text-3xs px-2 py-1 bg-emerald-600 text-white font-extrabold rounded-lg hover:bg-emerald-700 transition"
                          >
                            Launch Group Pool 🚀
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Form to add property */}
              <form onSubmit={handleAddProperty} className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-150/60">
                <h4 className="text-xs font-black text-slate-700 uppercase">Input Property Listing</h4>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    required
                    placeholder="Property Title (e.g. Lekki Plots)"
                    value={propTitle}
                    onChange={(e) => setPropTitle(e.target.value)}
                    className="p-2 border border-slate-200 rounded-lg text-xs font-semibold"
                  />
                  <input
                    type="text"
                    required
                    placeholder="Location Address"
                    value={propLocation}
                    onChange={(e) => setPropLocation(e.target.value)}
                    className="p-2 border border-slate-200 rounded-lg text-xs font-semibold"
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <select
                    value={propType}
                    onChange={(e: any) => setPropType(e.target.value)}
                    className="p-2 border border-slate-200 rounded-lg text-xs font-bold bg-white"
                  >
                    <option value="off-plan">Off-Plan Unit</option>
                    <option value="land">Raw Land Plot</option>
                    <option value="completed">Completed Unit</option>
                  </select>
                  <input
                    type="number"
                    required
                    placeholder="Price (NGN)"
                    value={propPrice}
                    onChange={(e) => setPropPrice(e.target.value)}
                    className="p-2 border border-slate-200 rounded-lg text-xs font-semibold"
                  />
                  <select
                    value={propDevId}
                    required
                    onChange={(e) => setPropDevId(e.target.value)}
                    className="p-2 border border-slate-200 rounded-lg text-xs font-bold bg-white"
                  >
                    <option value="">-- Choose Dev Partner --</option>
                    {partners.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="Title Status (e.g. C of O)"
                    value={propTitleStatus}
                    onChange={(e) => setPropTitleStatus(e.target.value)}
                    className="p-2 border border-slate-200 rounded-lg text-xs font-semibold"
                  />
                  <input
                    type="text"
                    placeholder="Surveyor Report Draft"
                    value={propSurveyReport}
                    onChange={(e) => setPropSurveyReport(e.target.value)}
                    className="p-2 border border-slate-200 rounded-lg text-xs font-semibold"
                  />
                </div>
                <div className="flex justify-between items-center">
                  <label className="flex items-center gap-1.5 text-2xs font-extrabold text-slate-600">
                    <input
                      type="checkbox"
                      checked={propLawyerVerified}
                      onChange={(e) => setPropLawyerVerified(e.target.checked)}
                      className="rounded"
                    />
                    Lawyer Title Deed Verified
                  </label>
                  <button
                    type="submit"
                    disabled={isSubmitting || !propDevId}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-black"
                  >
                    Upload Listing
                  </button>
                </div>
              </form>
            </div>

            {/* BOX 3: Property Construction Milestones management */}
            <div className="bg-white rounded-2xl border border-slate-200/70 p-5 space-y-4 shadow-sm md:col-span-2">
              <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                <div className="space-y-0.5">
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                    <Activity className="w-4 h-4 text-indigo-600" />
                    3. Gated Milestone Releases (Developer Independent Audit)
                  </h3>
                  <p className="text-3xs text-slate-400 font-medium">
                    Funds are released in stages, gated by surveyor reports. Approve milestones to trigger release payouts.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                
                {/* Select list of properties */}
                <div className="space-y-2">
                  <label className="text-2xs font-bold text-slate-500 uppercase tracking-wider block">Select Listing to Audit:</label>
                  <select
                    value={selectedPropertyId}
                    onChange={(e) => setSelectedPropertyId(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl"
                  >
                    <option value="">-- Select Listing to View Milestones --</option>
                    {properties.map(pr => (
                      <option key={pr.id} value={pr.id}>{pr.title}</option>
                    ))}
                  </select>

                  {selectedPropertyId && (
                    <form onSubmit={(e) => handleAddMilestone(e, selectedPropertyId)} className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3 mt-4">
                      <h4 className="text-2xs font-black text-slate-700 uppercase tracking-wider">Add Property Milestone</h4>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Roof-level Framing complete"
                        value={milesTitle}
                        onChange={(e) => setMilesTitle(e.target.value)}
                        className="w-full p-2 border border-slate-200 rounded-xl text-xs font-semibold bg-white"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="number"
                          required
                          placeholder="Release Pct (e.g. 20)"
                          value={milesPct}
                          onChange={(e) => setMilesPct(Number(e.target.value))}
                          className="p-2 border border-slate-200 rounded-xl text-xs font-semibold bg-white"
                        />
                        <button
                          type="submit"
                          disabled={isSubmitting}
                          className="bg-indigo-600 text-white rounded-xl text-xs font-black py-2"
                        >
                          Add Milestone
                        </button>
                      </div>
                    </form>
                  )}
                </div>

                {/* Milestones view & verification status */}
                <div className="md:col-span-2 space-y-3">
                  <label className="text-2xs font-bold text-slate-500 uppercase tracking-wider block">Construction Milestones List:</label>
                  {!selectedPropertyId ? (
                    <div className="p-6 bg-slate-50 text-center text-slate-400 text-xs font-bold border border-dashed border-slate-200 rounded-xl">
                      Select a property listing to see structural progress milestones
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {milestones.filter(m => m.propertyId === selectedPropertyId).length === 0 ? (
                        <p className="p-4 bg-slate-50 text-slate-500 text-xs font-semibold rounded-xl text-center">
                          No milestones loaded for this listing yet. Use the form on the left to add construction gates.
                        </p>
                      ) : (
                        milestones
                          .filter(m => m.propertyId === selectedPropertyId)
                          .map((mil, idx) => (
                            <div key={mil.id} className="p-4 bg-slate-50 rounded-xl border border-slate-200/60 flex flex-col sm:flex-row justify-between gap-3">
                              <div className="space-y-1">
                                <span className="text-3xs px-2 py-0.5 bg-indigo-100 rounded text-indigo-700 font-extrabold">
                                  Gate #{idx + 1}
                                </span>
                                <h4 className="text-xs font-bold text-slate-800">{mil.title}</h4>
                                <p className="text-3xs text-slate-400 font-bold flex items-center gap-1">
                                  <Camera className="w-3 h-3 text-indigo-500" /> Evidence: <span className="text-slate-600 font-semibold">{mil.evidenceUrl}</span>
                                </p>
                              </div>
                              <div className="flex items-center gap-4 shrink-0 sm:self-center">
                                <div className="text-right">
                                  <p className="text-xs font-black text-slate-800">{mil.releasePercentage}% Payout</p>
                                  <p className="text-3xs text-slate-400 font-bold">Of total target pool</p>
                                </div>
                                <div className="flex gap-1">
                                  {mil.isVerified ? (
                                    <span className="bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-xl px-2.5 py-1 text-2xs font-black flex items-center gap-1">
                                      <ShieldCheck className="w-3.5 h-3.5" /> Verified
                                    </span>
                                  ) : (
                                    <button
                                      onClick={() => handleVerifyMilestone(mil.id, true)}
                                      className="text-2xs px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-lg shadow"
                                    >
                                      Verify Stage
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))
                      )}
                    </div>
                  )}
                </div>

              </div>
            </div>

          </div>
        ) : (
          /* ========================================================================= */
          /* VIEW 2: CO-OWNER / SAVINGS MEMBER VIEW                                   */
          /* ========================================================================= */
          <div className="lg:col-span-12 space-y-6">
            
            {/* Pool Selector & Key Progress Bar Card */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm space-y-6">
              
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-100 pb-4">
                <div className="space-y-1">
                  <h3 className="text-md font-black text-slate-800 flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-indigo-600 shrink-0" />
                    Property Co-Ownership Investment Pool
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    Select open joint listings below. Funds are only triggered upon certified independent milestone surveyor check-offs.
                  </p>
                </div>

                <div className="flex items-center gap-2 w-full md:w-auto">
                  <select
                    value={selectedPoolId}
                    onChange={(e) => setSelectedPoolId(e.target.value)}
                    className="w-full md:w-72 p-2.5 bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl focus:ring-2 focus:ring-indigo-500/20"
                  >
                    {pools.map(p => {
                      const prop = properties.find(pr => pr.id === p.propertyId);
                      return (
                        <option key={p.id} value={p.id}>
                          {prop ? prop.title : p.id}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>

              {/* Pool Calculations Grid */}
              {!activePool ? (
                <div className="p-6 bg-slate-50 text-center text-slate-400 text-xs font-bold border border-dashed border-slate-200 rounded-xl">
                  No active pools initiated for this group yet. Toggle back to Admin to launch a pool.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  
                  {/* Left Column: Property Info / Surveyor report */}
                  <div className="space-y-4">
                    {activeProperty && (
                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-150 space-y-3">
                        <div className="flex justify-between items-start">
                          <span className="text-3xs font-black bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded capitalize">
                            {activeProperty.type} Listing
                          </span>
                          <span className="text-3xs font-black text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded flex items-center gap-0.5">
                            <ShieldCheck className="w-3 h-3" /> Verified Deed
                          </span>
                        </div>
                        <h4 className="text-sm font-extrabold text-slate-800 leading-snug">{activeProperty.title}</h4>
                        <p className="text-xs text-slate-500 flex items-start gap-1 font-medium">
                          <MapPin className="w-3.5 h-3.5 text-indigo-500 shrink-0 mt-0.5" />
                          {activeProperty.location}
                        </p>
                        
                        <div className="pt-2 border-t border-slate-200/60 text-xs space-y-1">
                          <p className="text-3xs font-bold text-slate-400 uppercase tracking-wider">Independent Title Audit</p>
                          <p className="text-xs font-bold text-slate-700 flex items-center gap-1">
                            <Scale className="w-4 h-4 text-indigo-600" /> Title: {activeProperty.titleStatus}
                          </p>
                          <p className="text-xs font-bold text-slate-700 flex items-center gap-1">
                            <FileCheck className="w-4 h-4 text-indigo-600" /> Lawyer Verified: {activeProperty.lawyerVerified ? "Yes ✓" : "Pending"}
                          </p>
                          <p className="text-3xs text-slate-500 leading-normal bg-white p-2 rounded-lg border border-slate-100 font-medium italic mt-2">
                            "{activeProperty.surveyorReport}"
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Middle Column: Current Funding Progress & Escrow coordinates */}
                  <div className="space-y-4">
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-150 space-y-3">
                      <h4 className="text-2xs font-black text-slate-700 uppercase tracking-wider">Funding Escrow Monitor</h4>
                      <div className="space-y-1">
                        <div className="flex justify-between items-end">
                          <p className="text-xs font-bold text-slate-500">Collected Pool:</p>
                          <p className="text-sm font-black text-slate-800">
                            {formatNaira(getPoolTotalContribs(activePool.id))}
                          </p>
                        </div>
                        <div className="flex justify-between items-end">
                          <p className="text-xs font-bold text-slate-500">Target Listing Price:</p>
                          <p className="text-xs font-extrabold text-slate-700">
                            {formatNaira(activePool.targetAmount)}
                          </p>
                        </div>
                      </div>

                      {/* Progress Bar */}
                      <div className="space-y-1 pt-1">
                        <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
                          <div 
                            className="bg-gradient-to-r from-indigo-500 to-indigo-600 h-full rounded-full transition-all duration-300" 
                            style={{ width: `${Math.min(100, (getPoolTotalContribs(activePool.id) / activePool.targetAmount) * 100)}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-3xs font-extrabold text-indigo-700 uppercase tracking-wider">
                          <span>
                            {((getPoolTotalContribs(activePool.id) / activePool.targetAmount) * 100).toFixed(1)}% Funded
                          </span>
                          <span>
                            {formatNaira(activePool.targetAmount - getPoolTotalContribs(activePool.id))} Left
                          </span>
                        </div>
                      </div>

                      <div className="bg-white p-3 rounded-lg border border-slate-200 text-3xs space-y-1">
                        <p className="text-3xs font-black text-indigo-700 flex items-center gap-1 uppercase tracking-wider">
                          🏦 SEC Trust Escrow Provider
                        </p>
                        <p className="font-extrabold text-slate-800">Bank: {activePool.escrowProvider}</p>
                        <p className="font-extrabold text-slate-800">Escrow Account: {activePool.escrowAccountNo}</p>
                        <p className="text-slate-400 font-medium">Verify transfers inside cooperative ledger.</p>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Dynamic Member ownership stakes summary */}
                  <div className="space-y-4">
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-150 space-y-2">
                      <h4 className="text-2xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                        <Percent className="w-3.5 h-3.5 text-indigo-600" />
                        Cooperative Stake Registry
                      </h4>
                      <p className="text-3xs text-slate-500 leading-normal font-medium">
                        Each member's ownership percentage is computed in real-time proportional to their Naira contributions in the pool.
                      </p>

                      <div className="space-y-1.5 max-h-40 overflow-y-auto pt-1">
                        {members.map(m => {
                          const hasStaked = getMemberContribInPool(activePool.id, m.id);
                          const totalPool = getPoolTotalContribs(activePool.id);
                          const stakePct = totalPool > 0 ? (hasStaked / totalPool) * 100 : 0;
                          return (
                            <div key={m.id} className="flex justify-between items-center text-xs p-1.5 bg-white rounded border border-slate-100">
                              <span className="font-bold text-slate-700">{m.name}</span>
                              <div className="text-right">
                                <p className="font-black text-slate-800">
                                  {stakePct.toFixed(2)}% Stake
                                </p>
                                <p className="text-3xs text-slate-400 font-semibold">{formatNaira(hasStaked)} paid</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                </div>
              )}

            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

              {/* Box 4: Active Milestones progress tracking & release approvals */}
              <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm space-y-4 lg:col-span-8">
                <div className="border-b border-slate-100 pb-3">
                  <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-indigo-600" />
                    Property Construction Milestones & Milestone releases
                  </h3>
                  <p className="text-3xs text-slate-400 font-medium mt-0.5">
                    View checked structural markers. Payout release of co-owned funds require collective co-owner signatures.
                  </p>
                </div>

                <div className="space-y-3">
                  {activePropertyMilestones.length === 0 ? (
                    <p className="p-4 bg-slate-50 text-center text-slate-500 text-xs font-semibold rounded-xl">
                      No construction milestones loaded for this listing.
                    </p>
                  ) : (
                    activePropertyMilestones.map((mil, idx) => {
                      const totalEscrow = getPoolTotalContribs(activePool?.id || "");
                      const milPayoutTarget = Math.floor(totalEscrow * (mil.releasePercentage / 100));
                      return (
                        <div key={mil.id} className="p-4 bg-slate-50 rounded-xl border border-slate-150 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                          <div className="space-y-1">
                            <span className="text-3xs px-2 py-0.5 bg-indigo-50 border border-indigo-150 rounded text-indigo-700 font-extrabold">
                              Phase #{idx + 1}
                            </span>
                            <h4 className="text-xs font-bold text-slate-800">{mil.title}</h4>
                            <div className="flex flex-wrap gap-2 text-3xs font-semibold text-slate-400 pt-0.5">
                              <span className="flex items-center gap-1">
                                <Camera className="w-3 h-3 text-indigo-500" /> Surveyor Stamp: <span className="text-slate-600">{mil.evidenceUrl}</span>
                              </span>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-4 shrink-0">
                            <div className="text-right">
                              <p className="text-xs font-black text-indigo-700">{mil.releasePercentage}% Payment release</p>
                              <p className="text-3xs text-slate-400 font-bold">({formatNaira(milPayoutTarget)})</p>
                            </div>
                            <div>
                              {mil.isVerified ? (
                                <span className="bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-xl px-2.5 py-1 text-2xs font-black flex items-center gap-0.5">
                                  <ShieldCheck className="w-3.5 h-3.5 shrink-0" /> Verified Stage
                                </span>
                              ) : (
                                <div className="space-y-1 text-right">
                                  <span className="text-3xs bg-amber-50 rounded-md px-1.5 py-1 border border-amber-100 text-amber-700 font-bold block">
                                    Awaiting Audit Check
                                  </span>
                                  <span className="text-3xs text-slate-400 font-medium">Audits protect your funds</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Box 5: Co-Owner Actions: Make Contribution Payment & File Dispute */}
              <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm space-y-4 lg:col-span-4">
                
                {/* 5A: Submit contribution payment */}
                {activePool && (
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-150 space-y-3">
                    <h4 className="text-xs font-black text-slate-700 uppercase flex items-center gap-1">
                      <Coins className="w-4 h-4 text-indigo-600" />
                      Make Pool Contribution
                    </h4>
                    
                    <form onSubmit={(e) => handleAddContribution(e, activePool.id)} className="space-y-3">
                      <div>
                        <label className="text-3xs font-black text-slate-500 uppercase block mb-1">Select Member Account:</label>
                        <select
                          value={contribMemberId}
                          required
                          onChange={(e) => setContribMemberId(e.target.value)}
                          className="w-full p-2 bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-lg"
                        >
                          <option value="">-- Choose Member Account --</option>
                          {members.map(m => (
                            <option key={m.id} value={m.id}>{m.name}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="text-3xs font-black text-slate-500 uppercase block mb-1">Contribution Amount (NGN):</label>
                        <input
                          type="number"
                          required
                          placeholder="e.g. 5000000"
                          value={contribAmount}
                          onChange={(e) => setContribAmount(e.target.value)}
                          className="w-full p-2 bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={isSubmitting || !contribMemberId}
                        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs py-2 rounded-lg transition shadow-sm"
                      >
                        Log Escrow Contribution ₦
                      </button>
                    </form>
                  </div>
                )}

                {/* 5B: File Dispute / Hold Release Payment */}
                {activePool && (
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-150 space-y-3">
                    <h4 className="text-xs font-black text-red-700 uppercase flex items-center gap-1">
                      <AlertTriangle className="w-4 h-4 text-red-600" />
                      File Escrow Dispute
                    </h4>
                    <p className="text-3xs text-slate-500 font-medium">
                      Filing open dispute automatically locks additional developer milestone payout releases until resolution.
                    </p>

                    <form onSubmit={(e) => handleFileDispute(e, activePool.id)} className="space-y-2">
                      <input
                        type="text"
                        required
                        placeholder="Dispute Title"
                        value={disputeTitle}
                        onChange={(e) => setDisputeTitle(e.target.value)}
                        className="w-full p-2 bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-lg"
                      />
                      <textarea
                        required
                        placeholder="Details of structural deviation, site delays, or title defect..."
                        value={disputeDesc}
                        onChange={(e) => setDisputeDesc(e.target.value)}
                        className="w-full p-2 bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-lg h-16 resize-none"
                      />
                      <button
                        type="submit"
                        disabled={isSubmitting || members.length === 0}
                        className="w-full bg-red-600 hover:bg-red-700 text-white font-black text-xs py-2 rounded-lg transition"
                      >
                        File Formal Conflict Flag 🛑
                      </button>
                    </form>
                  </div>
                )}

              </div>

              {/* Disputes log */}
              {disputes.filter(d => d.poolId === activePool?.id).length > 0 && (
                <div className="bg-red-50/20 border border-red-100 rounded-2xl p-5 shadow-sm space-y-3 lg:col-span-12">
                  <h4 className="text-xs font-black text-red-800 uppercase tracking-widest flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-red-600" />
                    Open Cooperative Disputes & Warnings ({disputes.filter(d => d.poolId === activePool?.id).length})
                  </h4>
                  <div className="space-y-2">
                    {disputes.filter(d => d.poolId === activePool?.id).map(dis => {
                      const memb = members.find(m => m.id === dis.memberId);
                      return (
                        <div key={dis.id} className="p-3 bg-white border border-red-150 rounded-xl flex justify-between items-center text-xs">
                          <div className="space-y-1">
                            <p className="font-bold text-slate-800">{dis.title}</p>
                            <p className="text-3xs text-slate-500 font-medium">{dis.description}</p>
                            <p className="text-3xs text-slate-400">Raised by: {memb ? memb.name : "Cooperative partner"}</p>
                          </div>
                          <div>
                            <span className="text-2xs bg-red-100 text-red-800 px-2.5 py-1 rounded-full font-black uppercase">
                              Active Halt 🛑
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

            </div>

          </div>
        )}

      </div>

    </div>
  );
}
