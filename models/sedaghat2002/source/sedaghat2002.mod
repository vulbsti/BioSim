JSim v1.1

// MODEL NUMBER: 0166
// MODEL NAME: Sedaghat2002_insulin_signal
// SHORT DESCRIPTION:  A mathematical model of metabolic insulin signaling pathways 
// based on the work of Ahmad Sedaghat, Arthur Sherman and Michael Quon 
// [2002, AM J Physiol Endocrinol Metab, 283,E1084-E1101].

import nsrunit;
unit conversion on;

math Sedaghat2002_insulin_signal {
realDomain t min;
t.min=0; t.max=60; t.delta=0.01;
int FEEDBACK = 0;                    // 0: No feedback, 1: Use feedback

extern real Cin(t);  // Input pulse

real Rp(t) M,  // Free insulin receptor conc (x2)
RIp(t) M,      // Receptor conc w/ 1 bound insulin molecule (x3)
RI2p(t) M,     // Receptor conc w/ 2 bound insulin molecules (x4)
               // Fig 1B: RI2Pp: redefined as conc of twice-bound phosphorylated receptors
RIPp(t) M,     // Conc of once-bound phosphorylated receptors (x5)
Rcyto(t) M,    // Conc of intracellular receptors (x6)
RI2Pcyto(t) M, // Conc of twice-bound intracellular phosphorylated receptors (x7)
RIPcyto(t) M,  // Conc of once-bound intracellular phosphorylated receptors (x8)
IRS1(t) M,     // Conc of unphosphorylated insulin receptor substrate (x9) 
IRS1P(t) M,    // Conc of phosphorylated insulin receptor substrate (x10)
IRS1sP(t) M,   // Feedback: Conc of IRS1 unable to associate and activate PI 3-kinase (x10a)
PI3k(t) M,     // Conc of free PI 3-kinase (x11)
IRSPI3k(t) M,  // IRSPI3k Conc of phosphorylated IRS-1/activated PI 3-kinase complex (x12)
PI345P3(t) dimensionless,// % of PI(3,4,5)P3 out of the total lipid population (x13)
PI45P2(t) dimensionless, // % of PI(4,5)P2 out of the total lipid population (x14)
PI34P2(t) dimensionless, // % of PI(3,4)P2 out of the total lipid population (x15)
Akt(t) dimensionless,    // % of unactivated Akt (x16)
AktP(t) dimensionless,   // % of activated Akt (x17)
PKCz(t) dimensionless,   // % of unactivated PKCz (x18) 
PKCzP(t) dimensionless,  // % of activated PKCzP (x19) 
GLUT4cyto(t) dimensionless,  // % of intracellular GLUT4 (x20)
GLUT4surf(t) dimensionless;  // % of cell surface GLUT4 (x21)

when (t=t.min) {
Rp=9*10^(-13);
RIp=0;
RI2p=0;
RIPp=0;
Rcyto=10^(-13);
RI2Pcyto=0; 
RIPcyto=0;
IRS1=10^(-12);
IRS1P=0;
IRS1sP=0;
PI3k=10^(-13);
IRSPI3k=0;
PI345P3=0.31;
PI45P2=99.4;
PI34P2=0.29;
Akt=100;
AktP=0;
PKCz=100;
PKCzP=0;
GLUT4cyto=96;
GLUT4surf=4;
}

real Insp(t) M,    // Free plasma Insulin conc input (plasma) (x1)
k1 M^(-1)*min^(-1),// Asoc rate const for first insulin molecule to bind to receptor
k_1 1/min,         // Diss rate const for first insulin molecule to bind to receptor
k2 M^(-1)*min^(-1),// Asoc rate const for second insulin molecule to bind to receptor 
k_2 1/min,         // Diss rate const for second insulin molecule to bind to receptor
k3 1/min,        // Rate const for receptor autophosphorylation
k_3 1/min,       // Rate const for receptor dephosphorylation
k4 1/min,        // Endocytosis rate const for free receptors
k_4 1/min,       // Exocytosis rate const for receptors
k44 1/min,       // Endocytosis rate const for bound receptors
k_44 1/min,      // Exocytosis rate const for twice-bound and once bound receptors
k5(t) M/min,     // Zero-order rate constant for receptor synthesis
k_5 1/min,       // rate constant for receptor degradation
k6 1/min,        // dephosphorylation rate const for intracellular receptors modulated by [PTP]
k7 1/min,        // Conversion rate between IRS1 and IRS1P
k_7 1/min,       // Conversion rate between IRS1P and IRS1 (PTP modulated)
k77 1/min,       // Rate const for serine phosphorylation  of IRS1 and PKCz
k_77 1/min,      // Rate const for serine dephosphorylation
k8 M^(-1)*min^(-1), k_8 1/min,     // Conversion rates between IRS1P and IRSPI3k
k9(t) 1/min, k9stimulated 1/min, k_9 1/min, // Conv rates between PI45P2 and PI345P3 [PTEN] modulated
k9basal 1/min, 
k10 1/min, k_10 1/min,             // Conv rates between PI34P2 and PI345P3 [SHIP] modulated
k11(t) 1/min, k_11 1/min,          // Conv rates between Akt and AktP
k12(t) 1/min, k_12 1/min,          // Conv rates between PKCz and PKCzP
k_13 1/min, k13(t) 1/min, k133(t) 1/min,
k14 1/min, k_14 1/min,
effect(t) dimensionless, IRp M, SHIP dimensionless, PTEN dimensionless, 
PTP(t) dimensionless, APequil dimensionless, PI3K M, 
PKC(t) dimensionless, Vmax dimensionless, Kd dimensionless, 
n dimensionless, tau dimensionless;

//Insp=if (t < 15) 10^(-7) else 0;
Insp = Cin(t);                   // Use Function generator for pulse...

k1=6*10^7;
k_1=0.2;
k2=k1;
k_2=100*k_1;
k3=2500;
k_3=k_1;
k_4=0.003;
k4=k_4/9;
k44=2.1*10^(-3);
k_44=2.1*10^(-4);
k_5=1.67*10^(-18);
k5=if ((Rcyto+RI2Pcyto+RIPcyto)>10^(-13)) k_5*(10 M) else k_5*(60 M);
k6=0.461;
k7=4.16;
k_7=(2.5/7.45)*k7;

//  Feedback model:
k77=(0.5 1/min)*ln(2);
k_77=k77*((2.5/7.45)*(3.7*10^(-13)))/((6.27*10^(-13))-
     (2.5/7.45)*(3.7*10^(-13)));

k_8=10;
k8=k_8*(5/70.775)*(10^(12) 1/M);
k9stimulated=1.39;
k_9=(94/3.1)*k9stimulated;
k9basal=(0.31/99.4)*k_9;
k9=(k9stimulated-k9basal)*(IRSPI3k/PI3K)+k9basal;
k_10=2.77;
k10=(3.1/2.9)*k_10;
k_11=(10 1/min)*ln(2);
k11=(0.1*k_11)*(PI345P3-0.31)/(3.10-0.31);
k_12=(10 1/min)*ln(2);
k12=(0.1*k_12)*(PI345P3-0.31)/(3.10-0.31);
k_13=0.167;
k13=(4/96)*k_13;
APequil=100/11;
effect=(0.2*AktP+0.8*PKCzP)/APequil;
k133=(40/60-4/96)*k_13*effect;
k_14=0.001155;
k14=96*k_14;
IRp=8.97*10^(-13);
SHIP=1.00;
PTEN=1.00;

// For feedback model use:
PTP = if (FEEDBACK = 0) 1 else
  if (AktP>400/11) 0 else 1.0*(1-0.25*(AktP/(100/11)));
//PTP=1;

// For feedback model use:
PI3K = if(FEEDBACK = 0) 5*10^-15 else
   k8*(3.7*10^(-13))*(10^(-13))*(1 M^2)/(k8*(3.7*10^(-13))*(1 M)+k_8);

// For feedback model (values directly affect feedback mechanism, CHange these
//  parameters to fit figs 8 and 9):

Vmax=20;
Kd=12;
n=4;
tau=1.5;

// For feedback model use:
PKC = if (FEEDBACK = 0) 7 else 
 ( Vmax*PKCzP*(t*(1 1/s)-tau)^n/((Kd^n)+PKCzP*(t*(1 1/s)-tau)^n) );

Rp:t=k_1*RIp + k_3*PTP*RIPp - k1*Insp*Rp+k_4*Rcyto-k4*Rp;
RIp:t=k1*Insp*Rp - k_1*RIp - k3*RIp;
RI2p:t=k2*Insp*RIPp - k_2*RI2p+k_44*RI2Pcyto-k44*RI2p;
RIPp:t=k3*RIp + k_2*RI2p - k2*Insp*RIPp - k_3*PTP*RIPp+k_44*RIPcyto-k44*RIPp;
Rcyto:t=k5 - k_5*Rcyto + k6*PTP*(RI2Pcyto+RIPcyto)+k4*Rp-k_4*Rcyto;
RI2Pcyto:t=k44*RI2p-k_44*RI2Pcyto-k6*PTP*RI2Pcyto;
RIPcyto:t=k44*RIPp-k_44*RIPcyto-k6*PTP*RIPcyto;

// For feedback model use:
IRS1:t = if (FEEDBACK = 0 )
 ( k_7*PTP*IRS1P-k7*IRS1*(RI2p+RIPp)/(IRp)  )                      //eq 14.
else 
 ( k_7*PTP*IRS1P-k7*IRS1*(RI2p+RIPp)/IRp +k_77*IRS1sP-k77*PKC*IRS1 ); //eq 30.

IRS1P:t=k7*IRS1*(RI2p+RIPp)/IRp+k_8*IRSPI3k-(k_7*PTP+k8*PI3k)*IRS1P;

// For feedback model use:
IRS1sP:t =if (FEEDBACK = 0 ) 0 else
   (k77*PKC*IRS1 - k_77*IRS1sP);                                     // eq 31.

PI3k:t=k_8*IRSPI3k-k8*IRS1P*PI3k;
IRSPI3k:t=k8*IRS1P*PI3k-k_8*IRSPI3k;
PI345P3:t=k9*PI45P2+k10*PI34P2-(k_9*PTEN+k_10*SHIP)*PI345P3;
PI45P2:t=k_9*PTEN*PI345P3-k9*PI45P2;
PI34P2:t=k_10*SHIP*PI345P3-k10*PI34P2;
Akt:t=k_11*AktP-k11*Akt;
AktP:t=k11*Akt-k_11*AktP;
PKCz:t=k_12*PKCzP-k12*PKCz;
PKCzP:t=k12*PKCz-k_12*PKCzP;
GLUT4cyto:t=k_13*GLUT4surf-(k13+k133)*GLUT4cyto+k14-k_14*GLUT4cyto;
GLUT4surf:t=(k13+k133)*GLUT4cyto-k_13*GLUT4surf;


}

/*
         

 DETAILED DESCRIPTION:
    This is a mathematical model that explicitly represents many of the known 
    signaling components mediating translocation of the insulin-responsive glucose 
    transporter GLUT4 and gives insight into the complexities of metabolic insulin 
    signaling pathways. A novel mechanistic model of postreceptor events including 
    phosphorylation of insulin receptor substrate-1,activation of phosphatidylinositol 
    3-kinase, and subsequent activation of downstream kinases Akt and protein kinase C 
    is coupled with previously validated subsystem models of insulin receptor binding, 
    receptor recycling, and GLUT4 translocation. A system of differential equations is 
    defined by the structure of the model. Rate constants and model parameters are 
    constrained by published experimental data. Model simulations of insulin 
    dose-response experiments agree with published experimental data and also generate 
    expected qualitative behaviors such as sequential signal amplification and increased 
    sensitivity of downstream components.

    This JSim version was developed by Maris Lemba [2003] as a project while at the University of Washington.

 SHORTCOMINGS/GENERAL COMMENTS:
	- Feedback model variant does not have correct parameter fits to reproduce
          Fig 8 and 9 of Sedaghat 2002 paper. Must adjust Paramters for PKC(t).
 
 KEY WORDS: signal transduction, metabolism, insulin resistance, GLUT4, glucose, feedback,
  data, publication  

 REFERENCES:
     Ahmad Sedaghat, Arthur Sherman and Michael Quon, A mathematical model of metabolic 
     insulin signaling pathways, 2002, AM J Physiol Endocrinol Metab, 283,E1084-E1101. 

	

 REVISION HISTORY:
	Original Author : Maris Lemba Date: 2003
	Revised by      : BEJ  Date: 14/July/2010  
        Revision: 1) Add figures
	          2) Update parameter names
                  3) Add ability to run model w /wo feedback
	

 COPYRIGHT AND REQUEST FOR ACKNOWLEDGMENT OF USE:   
  Copyright (C) 1999-2010 University of Washington. From the National Simulation Resource,  
  Director J. B. Bassingthwaighte, Department of Bioengineering, University of Washington, Seattle WA 98195-5061. 
  Academic use is unrestricted. Software may be copied so long as this copyright notice is included.
  
  This software was developed with support from NIH grant HL073598. 
  Please cite this grant in any publication for which this software is used and send an email 
  with the citation and, if possible, a PDF file of the paper to: staff@physiome.org. 

*/


