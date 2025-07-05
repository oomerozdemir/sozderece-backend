--
-- PostgreSQL database dump
--

-- Dumped from database version 17.5
-- Dumped by pg_dump version 17.5

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: BillingInfo; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."BillingInfo" (
    id integer NOT NULL,
    email text NOT NULL,
    name text NOT NULL,
    surname text NOT NULL,
    address text NOT NULL,
    district text NOT NULL,
    city text NOT NULL,
    "postalCode" text NOT NULL,
    phone text NOT NULL,
    "allowEmails" boolean NOT NULL
);


ALTER TABLE public."BillingInfo" OWNER TO postgres;

--
-- Name: BillingInfo_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public."BillingInfo_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public."BillingInfo_id_seq" OWNER TO postgres;

--
-- Name: BillingInfo_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public."BillingInfo_id_seq" OWNED BY public."BillingInfo".id;


--
-- Name: Coach; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Coach" (
    id integer NOT NULL,
    name text NOT NULL,
    subject text NOT NULL,
    description text NOT NULL,
    image text NOT NULL,
    "userId" integer
);


ALTER TABLE public."Coach" OWNER TO postgres;

--
-- Name: Coach_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public."Coach_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public."Coach_id_seq" OWNER TO postgres;

--
-- Name: Coach_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public."Coach_id_seq" OWNED BY public."Coach".id;


--
-- Name: Contact; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Contact" (
    id integer NOT NULL,
    name text NOT NULL,
    phone text NOT NULL,
    email text NOT NULL,
    message text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."Contact" OWNER TO postgres;

--
-- Name: Contact_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public."Contact_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public."Contact_id_seq" OWNER TO postgres;

--
-- Name: Contact_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public."Contact_id_seq" OWNED BY public."Contact".id;


--
-- Name: Coupon; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Coupon" (
    id integer NOT NULL,
    code text NOT NULL,
    "discountRate" integer NOT NULL,
    "usageLimit" integer NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."Coupon" OWNER TO postgres;

--
-- Name: CouponUsage; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."CouponUsage" (
    id integer NOT NULL,
    "userId" integer NOT NULL,
    "couponId" integer NOT NULL,
    "usedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."CouponUsage" OWNER TO postgres;

--
-- Name: CouponUsage_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public."CouponUsage_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public."CouponUsage_id_seq" OWNER TO postgres;

--
-- Name: CouponUsage_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public."CouponUsage_id_seq" OWNED BY public."CouponUsage".id;


--
-- Name: Coupon_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public."Coupon_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public."Coupon_id_seq" OWNER TO postgres;

--
-- Name: Coupon_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public."Coupon_id_seq" OWNED BY public."Coupon".id;


--
-- Name: Order; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Order" (
    id integer NOT NULL,
    package text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "userId" integer NOT NULL,
    "billingInfoId" integer NOT NULL,
    "endDate" timestamp(3) without time zone NOT NULL,
    "startDate" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    "refundMessage" text,
    "refundReason" text
);


ALTER TABLE public."Order" OWNER TO postgres;

--
-- Name: OrderItem; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."OrderItem" (
    id integer NOT NULL,
    name text NOT NULL,
    price text NOT NULL,
    quantity integer NOT NULL,
    description text NOT NULL,
    "orderId" integer NOT NULL
);


ALTER TABLE public."OrderItem" OWNER TO postgres;

--
-- Name: OrderItem_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public."OrderItem_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public."OrderItem_id_seq" OWNER TO postgres;

--
-- Name: OrderItem_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public."OrderItem_id_seq" OWNED BY public."OrderItem".id;


--
-- Name: Order_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public."Order_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public."Order_id_seq" OWNER TO postgres;

--
-- Name: Order_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public."Order_id_seq" OWNED BY public."Order".id;


--
-- Name: Package; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Package" (
    id integer NOT NULL,
    name text NOT NULL,
    description text NOT NULL,
    price double precision NOT NULL
);


ALTER TABLE public."Package" OWNER TO postgres;

--
-- Name: Package_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public."Package_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public."Package_id_seq" OWNER TO postgres;

--
-- Name: Package_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public."Package_id_seq" OWNED BY public."Package".id;


--
-- Name: User; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."User" (
    id integer NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    password text NOT NULL,
    role text NOT NULL,
    phone text,
    "isVerified" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "emailVerified" boolean DEFAULT false NOT NULL,
    "phoneVerified" boolean DEFAULT false NOT NULL,
    "assignedCoachId" integer,
    grade text,
    track text
);


ALTER TABLE public."User" OWNER TO postgres;

--
-- Name: User_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public."User_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public."User_id_seq" OWNER TO postgres;

--
-- Name: User_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public."User_id_seq" OWNED BY public."User".id;


--
-- Name: _prisma_migrations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public._prisma_migrations (
    id character varying(36) NOT NULL,
    checksum character varying(64) NOT NULL,
    finished_at timestamp with time zone,
    migration_name character varying(255) NOT NULL,
    logs text,
    rolled_back_at timestamp with time zone,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    applied_steps_count integer DEFAULT 0 NOT NULL
);


ALTER TABLE public._prisma_migrations OWNER TO postgres;

--
-- Name: BillingInfo id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."BillingInfo" ALTER COLUMN id SET DEFAULT nextval('public."BillingInfo_id_seq"'::regclass);


--
-- Name: Coach id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Coach" ALTER COLUMN id SET DEFAULT nextval('public."Coach_id_seq"'::regclass);


--
-- Name: Contact id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Contact" ALTER COLUMN id SET DEFAULT nextval('public."Contact_id_seq"'::regclass);


--
-- Name: Coupon id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Coupon" ALTER COLUMN id SET DEFAULT nextval('public."Coupon_id_seq"'::regclass);


--
-- Name: CouponUsage id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."CouponUsage" ALTER COLUMN id SET DEFAULT nextval('public."CouponUsage_id_seq"'::regclass);


--
-- Name: Order id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Order" ALTER COLUMN id SET DEFAULT nextval('public."Order_id_seq"'::regclass);


--
-- Name: OrderItem id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."OrderItem" ALTER COLUMN id SET DEFAULT nextval('public."OrderItem_id_seq"'::regclass);


--
-- Name: Package id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Package" ALTER COLUMN id SET DEFAULT nextval('public."Package_id_seq"'::regclass);


--
-- Name: User id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."User" ALTER COLUMN id SET DEFAULT nextval('public."User_id_seq"'::regclass);


--
-- Data for Name: BillingInfo; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."BillingInfo" (id, email, name, surname, address, district, city, "postalCode", phone, "allowEmails") FROM stdin;
1	oomerozdemir40@hotmail.com	Ome	Ozdemir	dfdsfdsfsdf	asdasd	sdfsdfsd	1232131	123123	t
2	oomerozdemir40@hotmail.com	Ome	Ozdemir	dfdsfdsfsdf	sdfdsfsd	sdfsdfsd	1232131	123123	t
3	oomerozdemir40@hotmail.com	Ome	Ozdemir	dfdsfdsfsdf	sdfdsfsd	1231231	1232131	123123	t
4	oomerozdemir40@hotmail.com	Ome	Ozdemir	dfdsfdsfsdf	asdasd	1231231	1232131	123123	t
5	oomerozdemir40@hotmail.com	Ome	Ozdemir	asf	sdfdsfsd	sdfsdfsd	1232131	123123	t
6	oomerozdemir40@hotmail.com	Ome	dfa	dfdsfdsfsdf	123123	1231231	1232131	123123	t
7	oomerozdemir40@hotmail.com	Ome	dfa	dfdsfdsfsdf	123123	1231231	1232131	123123	t
8	oomerozdemir40@hotmail.com	Ome	dfa	dfdsfdsfsdf	123123	1231231	1232131	123123	t
9	oomerozdemir40@hotmail.com	Ome	dfa	dfdsfdsfsdf	sdfdsfsd	1231231	1232131	123123	t
10	oomerozdemir40@hotmail.com	sad	asd	asdsad	sdfdsfsd	sdfsdfsd	1232131	123123	t
11	oomerozdemir40@hotmail.com	sad	asd	asdsad	sdfdsfsd	sdfsdfsd	1232131	123123	t
12	oomerozdemir40@hotmail.com	Ome	Ozdemir	asdsad	123123	sdfsdfsd	1232131	123123	t
14	oomerozdemir40@hotmail.com	Ome	asd	asdsad	123123	1231231	1232131	123123	t
13	oomerozdemir40@hotmail.com	Omer	Ozdemir	asf	sdfdsfsd	sdfsdfsd	1232131	123123	t
15	oomerozdemir40@hotmail.com	Ome	Ozdemir	asf	123123	1231231	sadasd	123123	t
16	oomerozdemir40@hotmail.com	sad	asd	asf	123123	sdfsdfsd	sadasd	sasdasd	f
17	oomerozdemir40@hotmail.com	sad	Ozdemir	asdsad	asdasd	sdfsdfsd	sadasd	123123	t
18	oomerozdemir40@hotmail.com	sad	Ozdemir	asdsad	asdasd	sdfsdfsd	sadasd	123123	t
19	oomerozdemir40@hotmail.com	sad	Ozdemir	asdsad	123123	asdsada	sadasd	sasdasd	t
20	oomerozdemir40@hotmail.com	sad	dfa	asf	sadasdasd	sdfsdfsd	1232131	sasdasd	t
21	oomerozdemir40@hotmail.com	Ome	asd	asdsad	asdasd	sdfsdfsd	sadasd	123123	t
22	oomerozdemir40@hotmail.com	Ome	dfa	asfsadasd	asdasd	1231231	1232131	sasdasd	t
23	oomerozdemir40@hotmail.com	Ome	asd	asf	sdfdsfsd	1231231	sadasd	123123	t
24	oomerozdemir40@hotmail.com	sad	asd	asdsad	asdasd	sdfsdfsd	sadasd	123123	t
25	oomerozdemir40@hotmail.com	Ome	Ozdemir	asdsad	123123	1231231	1232131	123123	f
26	oomerozdemir40@hotmail.com	Ome	Ozdemir	asdsad	asdasd	sdfsdfsd	sadasd	123123	t
27	oomerozdemir40@hotmail.com	Ome	dfa	asdsad	sdfdsfsd	sdfsdfsd	1232131	123123	t
28	oomerozdemir40@hotmail.com	asd	Ozdemir	sad	sdfdsfsd	sdfsdfsd	1232131	123123	t
29	oomerozdemir40@hotmail.com	sad	Ozdemir	dfdsfdsfsdf	123123	sdfsdfsd	1232131	123123	t
30	oomerozdemir40@hotmail.com	sad	dfa	asf	sdfdsfsd	sdfsdfsd	1232131	123123	t
31	oomerozdemir40@hotmail.com	Ome	dfa	dfdsfdsfsdf	sdfdsfsd	sdfsdfsd	1232131	123123	t
32	oomerozdemir40@hotmail.com	Ome	dfa	dfdsfdsfsdf	sdfdsfsd	sdfsdfsd	1232131	123123	t
33	oomerozdemir40@hotmail.com	Ome	Ozdemir	asdsad	123123	sdfsdfsd	1232131	sasdasd	t
34	oomerozdemir40@hotmail.com	Ome	Ozdemir	asdsad	123123	sdfsdfsd	1232131	sasdasd	t
35	oomerozdemir40@hotmail.com	Ome	dfa	dfdsfdsfsdf	sdfdsfsd	sdfsdfsd	1232131	sasdasd	t
36	oomerozdemir40@hotmail.com	Ome	Ozdemir	dfdsfdsfsdf	sdfdsfsd	sdfsdfsd	1232131	123123	t
37	oomerozdemir40@hotmail.com	Ome	dfa	dfdsfdsfsdf	sdfdsfsd	sdfsdfsd	1232131	sasdasd	t
38	oomerozdemir40@hotmail.com	Ome	dfa	dfdsfdsfsdf	sdfdsfsd	sdfsdfsd	1232131	123123	t
39	oomerozdemir40@hotmail.com	asd	as	asd	asd	asd	asd	ad	t
40	oomerozdemir40@hotmail.com	Ome	Ozdemir	asdsad	123123	sdfsdfsd	sadasd	123123	t
41	oomerozdemir40@hotmail.com	asd	sad	sadsa	asd	as	asd	sa	t
42	oomerozdemir40@hotmail.com	Ome	sad	sad	sad	sad	asd	sad	f
43	oomerozdemir40@hotmail.com	asd	sad	asd	sad	asd	dsa	sad	t
44	oomerozdemir40@hotmail.com	Ome	Ozdemir	dfdsfdsfsdf	123123	sdfsdfsd	sadasd	123123	t
45	oomerozdemir40@hotmail.com	Ome	dfa	asdsad	sdfdsfsd	sdfsdfsd	1232131	123123	t
\.


--
-- Data for Name: Coach; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."Coach" (id, name, subject, description, image, "userId") FROM stdin;
14	Samet Aktaslı	Berber	Traş yaparım	/uploads/1751638466573.png	43
15	Umut Kavzan	Pivot ST	Sırtı Dönük oynar	/uploads/1751638567869.png	44
16	Mustafa Kemal Kavzan	Maestro	Pas dağıtır şut çeker	/uploads/1751638665916.png	45
17	ibrahim Ömeroğlu	THY Pilotu-part time sag bek	Sürekli uçar yarı zamanlı top kapar rakiıbi kovalar	/uploads/1751638774975.png	46
18	Alperen Türcan	Makine Çizici	Bilardo oynar,makine çizer arada kaza yapar	/uploads/1751638965518.png	48
19	Necdet Utku Mete	Versatil Bir adam	Excel mühendisi,Büyük kaptan ve yorulmak bilmeyen halı saha topcusu	/uploads/1751639085980.png	49
20	Burak Dereli	Yazılımcı ve BABA STOPER	Arada işe gider ve Adam geçirmez	/uploads/1751639209406.png	50
\.


--
-- Data for Name: Contact; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."Contact" (id, name, phone, email, message, "createdAt") FROM stdin;
1	Ali	05321234567	ali@example.com	Koçluk hakkında bilgi almak istiyorum	2025-05-16 16:30:26.487
2	Deneme	05001234567	deneme@example.com	Mesaj içeriği	2025-05-18 14:45:29.049
3	Deneme	05001234567	deneme@example.com	Mesaj içeriği	2025-05-18 16:53:58.721
\.


--
-- Data for Name: Coupon; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."Coupon" (id, code, "discountRate", "usageLimit", "createdAt") FROM stdin;
6	kupon10	10	1	2025-07-02 12:27:44.792
\.


--
-- Data for Name: CouponUsage; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."CouponUsage" (id, "userId", "couponId", "usedAt") FROM stdin;
1	14	6	2025-07-02 12:28:02.976
\.


--
-- Data for Name: Order; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."Order" (id, package, "createdAt", "userId", "billingInfoId", "endDate", "startDate", "updatedAt", status, "refundMessage", "refundReason") FROM stdin;
38	YKS 2026 PAKETİ	2025-07-03 13:33:01.885	42	44	2025-08-03 13:33:01.877	2025-07-03 13:33:01.877	2025-07-03 13:33:01.885	active	\N	\N
39	YKS 2026 PAKETİ	2025-07-03 13:33:39.344	42	45	2025-08-03 13:33:39.306	2025-07-03 13:33:39.306	2025-07-03 13:33:39.344	active	\N	\N
\.


--
-- Data for Name: OrderItem; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."OrderItem" (id, name, price, quantity, description, "orderId") FROM stdin;
31	YKS 2026 PAKETİ	3000₺ / ay	1	Koçluk + birebir özel ders + 7/24 destek isteyenler için.	38
32	YKS 2026 PAKETİ	3000₺ / ay	1	Koçluk + birebir özel ders + 7/24 destek isteyenler için.	39
\.


--
-- Data for Name: Package; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."Package" (id, name, description, price) FROM stdin;
1	YKS Gold	12 haftalık yoğun sınav kampı	1499.99
\.


--
-- Data for Name: User; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."User" (id, name, email, password, role, phone, "isVerified", "createdAt", "emailVerified", "phoneVerified", "assignedCoachId", grade, track) FROM stdin;
44	Umut Kavzan	ukavzan@gmail.com	$2b$10$LYTTp9Ach3.5lqgLoJU0VOwX36PchTpdPsO1fgFHeQtFOMvxV6tvq	coach	\N	t	2025-07-04 14:16:07.932	t	f	\N	\N	\N
45	Mustafa Kemal Kavzan	kavzann@gmail.com	$2b$10$t6ow4p1xZCG5iTKX/0v7t.d0CEh/zLEDs0khLLNRvPb7TfGQZf3re	coach	\N	t	2025-07-04 14:17:45.98	t	f	\N	\N	\N
46	ibrahim Ömeroğlu	oglu@gmail.com	$2b$10$g7WZieXhKiiYQGyfVLeG7uHiKGDLWpRwwT15oUL0w9yvZal93t8uS	coach	\N	t	2025-07-04 14:19:35.075	t	f	\N	\N	\N
47	İbrahim Ömeroğlu	ogluu@gmail.com	$2b$10$34sRd7l3ofY7lR6RIrXQVuCJKnKMcTjd4gsDFLFHxc0BPseew/.5.	coach	\N	t	2025-07-04 14:19:58.763	t	f	\N	\N	\N
48	Alperen Türcan	turcann@gmail.com	$2b$10$TabjXfacpB9tiYUPINTifuNqV.2TpYpLKJbzgYzUDw66T.yD8l/OK	coach	\N	t	2025-07-04 14:22:45.628	t	f	\N	\N	\N
49	Necdet Utku Mete	mete@gmail.com	$2b$10$b8Yv9gStU6o0uDs4YnEUduAQJwc4Xxy6AWAo41wmhIqQ35T2YEnz6	coach	\N	t	2025-07-04 14:24:46.043	t	f	\N	\N	\N
50	Burak Dereli	dereli@gmail.com	$2b$10$uJ4tDnbppWTYSwmme2qbyefFfCNUYzE8ufagCDNMLUxrfmFb0JDfG	coach	\N	t	2025-07-04 14:26:49.469	t	f	\N	\N	\N
14	Omer Ozdemir	omerozdemir@example.com	$2b$10$58D8phP5XF8fjZHyWxpRau.qkTIpcSk5X8aAJWfFnWI52HzqcBksu	student	12345622ss	f	2025-05-29 11:06:06.883	t	t	\N	\N	\N
42	Zeynep Ozdemir	zeynep@example.com	$2b$10$lyvymtWOI25LG4vSByPLP.nTbQlwMzMc/7ui9i11UPTn2QD2hdicm	student	123456	f	2025-07-02 13:19:52.461	f	f	\N	8	\N
3	Admin	admin@example.com	$2b$10$TiKBONKPxjnMppmJs2oxkeOMEfqluVoZcuzBlbKaBC0/ScRZwdtia	admin	123456	f	2025-05-20 20:14:38.986	f	t	\N	\N	\N
43	Samet Aktaslı	samet@gmail.com	$2b$10$6Y2E79PWNjpsAmLZi/39BuSh9UL8ob4dsY4KwrevpPeN283nwB6E6	coach	\N	t	2025-07-04 14:14:26.638	t	f	\N	\N	\N
\.


--
-- Data for Name: _prisma_migrations; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public._prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count) FROM stdin;
b6a8a1a6-fa67-4d34-ab4b-6d1f30a82905	9ce00516a78b8b2da5e46f3c16b563690c61e0b2a66ad34240ab4e05723a1250	2025-07-02 16:18:57.946541+03	20250702131857_add_grade_and_track	\N	\N	2025-07-02 16:18:57.942158+03	1
1f7949c2-050e-4b8b-a179-e08bdaa84081	80609962eee2c1ecaa1393f78bd64b0081712105ba5576fc0e75ecc30d9593d7	2025-05-16 19:30:19.104215+03	20250516160050_init	\N	\N	2025-05-16 19:30:19.097728+03	1
f992841e-d10c-46fa-b3f5-fcc7db7094f9	5a64c9ff5f030a9b1f844729a5ae9a74864b1c279d4b379fc1267ae6da990d83	2025-06-07 20:07:44.142742+03	20250607170744_add_refund_fields	\N	\N	2025-06-07 20:07:44.138311+03	1
82b2082a-1343-4702-82de-0d9ed6ab467c	8bad04190ca4c72fddcd3e4834b8bb24c5e2a97fd9181c23302896b420f6c7d6	2025-05-17 15:45:16.827337+03	20250517124516_add_user_model	\N	\N	2025-05-17 15:45:16.806296+03	1
594cd59b-1ade-4c25-ae92-becff1076b7c	6fc08f976e04d5fdc585057588c5801c7e32d486c82d643933b27241a49d8cf8	2025-05-18 17:04:29.705354+03	20250518140429_init_relationships	\N	\N	2025-05-18 17:04:29.673749+03	1
20b58c0b-ef7b-4aba-a3ef-026908afc1c1	52ca907db1f131b0cb48d3debe148667ef034f663017d20e8cc3ff82dfa0c277	2025-05-19 20:02:12.157777+03	20250519170212_add_phone_to_user	\N	\N	2025-05-19 20:02:12.15236+03	1
cd9def21-48b2-4b88-a8a4-e16c93df5c7f	b9287033dbc32ed74265f1aa60d1d0df302b718db1d0c938f068d7ffd47eef5d	2025-06-12 00:06:34.015408+03	20250611210633_add_selected_coach	\N	\N	2025-06-12 00:06:34.011769+03	1
b2118ad4-1d33-4ee6-8898-26a31ec3fd54	fa3cc919db9515500ffc55097c50997b2e5d572419c6e6fd29a54c1ebfcc7ad3	2025-05-20 17:54:11.1019+03	20250520145411_add_is_verified	\N	\N	2025-05-20 17:54:11.095888+03	1
ff3554d5-7957-4e34-b11c-f7f5cba7f377	0c03e3b165b5d74dff49dd8a7ddb2230e7d1c39c3a0cd443a1c13c19a8bf3643	2025-05-20 20:14:38.989632+03	20250520171438_add_created_at_to_user	\N	\N	2025-05-20 20:14:38.984185+03	1
a94912cd-6b1d-47e2-a8b7-e7136091d786	2f7f808fd780b3993b7f00aa50a419b6d580ccedefcede5f9c5ac536c4148f86	2025-05-20 21:07:03.63202+03	20250520180703_add_verification_flags	\N	\N	2025-05-20 21:07:03.628743+03	1
603b8c09-11ec-4c20-9d7d-3852d102c968	f9d5715850613da5a49e05b3defac04d9b3d9a3fa6281e66a76c1e686bcde4c5	2025-06-12 16:02:24.945823+03	20250612130224_add_coach_model	\N	\N	2025-06-12 16:02:24.931704+03	1
f8f12633-81f5-492e-97a1-057742e0d8c0	10c786a83fe7c71a16a760ddf1107edd0ab1eb0d4dc409a6f67ae5a7d9bcaac6	2025-05-22 20:38:30.700005+03	20250522173830_add_package_model	\N	\N	2025-05-22 20:38:30.683647+03	1
bc25e91c-9724-4ac9-bb15-f54f8f4d2bd3	3543ea133633133fbd1aba2574ae1fd4b5a0d66d80b38cb9c47d950e36f19bc7	2025-06-01 20:00:52.912862+03	20250601170052_add_billinginfo_optional	\N	\N	2025-06-01 20:00:52.888591+03	1
bd5d0ce2-260f-4ee5-906a-d33669cf84bd	82e392e29646e8d59dbe2660da2f5b6943c6f66a8939b0db8ff8ca20d66eef4e	2025-06-02 14:15:58.240427+03	20250602111558_temp_add_dates	\N	\N	2025-06-02 14:15:58.234123+03	1
dafe33c9-1e99-4fbf-8fb6-33a0253149d1	15219eb3b9b64132269ea6c3744a456015141fc432ad199d88a0cdc3150b4362	2025-06-12 20:31:00.973126+03	20250612173100_add_selected_coach_to_order	\N	\N	2025-06-12 20:31:00.954939+03	1
301372f9-4434-4dbb-b95d-5e5bf0dd7d3d	cb62df840bededc420989d876e9ebc1e47b4a0564146ad02fdbfa2a73c4203ef	2025-06-02 14:19:09.195934+03	20250602111909_finalize_order_fields	\N	\N	2025-06-02 14:19:09.186343+03	1
c4d62b87-4d1b-4684-abab-f87c08d39ee2	76d00a794bc9244fd9fe993ef6d51e1bbaad33bef11f26cf1c4c0a3ef9ba3917	2025-06-02 21:05:19.499389+03	20250602180519_add_order_status	\N	\N	2025-06-02 21:05:19.495354+03	1
387c561e-c973-40da-af5a-a8230fbd3414	a2ebb95132fe5946e8ddf5d84d2cc8631d8bbcc54cf7235afda7fe66c270e3b3	2025-06-03 22:12:54.862782+03	20250603191254_add_notification_model	\N	\N	2025-06-03 22:12:54.845728+03	1
f119ac9e-15aa-45fa-aa5b-f54e1f0a4ddb	44d28e0c765541af9507940c9f623bbe70ab2cb2fbc70d18d1d64e6f9af295f3	2025-06-27 21:40:02.485543+03	20250627184002_add_assigned_coach	\N	\N	2025-06-27 21:40:02.47096+03	1
03e951ed-73a1-4491-95d2-36fe9c4d215a	e38d494bb58c25c1f1a2fdc0642543a37d89131ecac6ded59b59ac8921d4c3bb	2025-06-29 16:20:52.853756+03	20250629132052_link_user_to_coach	\N	\N	2025-06-29 16:20:52.840555+03	1
5ed61286-2256-46f6-a934-d81276d96702	f85a1261b30029f052f8502ebbba95a1dbccd47272959ebe91bd7186ee8136f6	2025-07-01 15:16:47.96309+03	20250701121647_add_coupon_support	\N	\N	2025-07-01 15:16:47.941491+03	1
8d4ac98f-0922-448a-b155-f2ea36cae34d	842a730b3eae535f9bb270127335e7c132cf662fa699995f225a5accb44722ba	2025-07-01 15:55:53.654132+03	20250701125553_add_coupon_usage	\N	\N	2025-07-01 15:55:53.638636+03	1
\.


--
-- Name: BillingInfo_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public."BillingInfo_id_seq"', 45, true);


--
-- Name: Coach_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public."Coach_id_seq"', 20, true);


--
-- Name: Contact_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public."Contact_id_seq"', 3, true);


--
-- Name: CouponUsage_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public."CouponUsage_id_seq"', 1, true);


--
-- Name: Coupon_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public."Coupon_id_seq"', 6, true);


--
-- Name: OrderItem_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public."OrderItem_id_seq"', 32, true);


--
-- Name: Order_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public."Order_id_seq"', 39, true);


--
-- Name: Package_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public."Package_id_seq"', 1, true);


--
-- Name: User_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public."User_id_seq"', 50, true);


--
-- Name: BillingInfo BillingInfo_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."BillingInfo"
    ADD CONSTRAINT "BillingInfo_pkey" PRIMARY KEY (id);


--
-- Name: Coach Coach_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Coach"
    ADD CONSTRAINT "Coach_pkey" PRIMARY KEY (id);


--
-- Name: Contact Contact_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Contact"
    ADD CONSTRAINT "Contact_pkey" PRIMARY KEY (id);


--
-- Name: CouponUsage CouponUsage_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."CouponUsage"
    ADD CONSTRAINT "CouponUsage_pkey" PRIMARY KEY (id);


--
-- Name: Coupon Coupon_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Coupon"
    ADD CONSTRAINT "Coupon_pkey" PRIMARY KEY (id);


--
-- Name: OrderItem OrderItem_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."OrderItem"
    ADD CONSTRAINT "OrderItem_pkey" PRIMARY KEY (id);


--
-- Name: Order Order_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Order"
    ADD CONSTRAINT "Order_pkey" PRIMARY KEY (id);


--
-- Name: Package Package_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Package"
    ADD CONSTRAINT "Package_pkey" PRIMARY KEY (id);


--
-- Name: User User_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."User"
    ADD CONSTRAINT "User_pkey" PRIMARY KEY (id);


--
-- Name: _prisma_migrations _prisma_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public._prisma_migrations
    ADD CONSTRAINT _prisma_migrations_pkey PRIMARY KEY (id);


--
-- Name: Coach_userId_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "Coach_userId_key" ON public."Coach" USING btree ("userId");


--
-- Name: CouponUsage_userId_couponId_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "CouponUsage_userId_couponId_key" ON public."CouponUsage" USING btree ("userId", "couponId");


--
-- Name: Coupon_code_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "Coupon_code_key" ON public."Coupon" USING btree (code);


--
-- Name: User_email_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "User_email_key" ON public."User" USING btree (email);


--
-- Name: Coach Coach_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Coach"
    ADD CONSTRAINT "Coach_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: CouponUsage CouponUsage_couponId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."CouponUsage"
    ADD CONSTRAINT "CouponUsage_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES public."Coupon"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: CouponUsage CouponUsage_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."CouponUsage"
    ADD CONSTRAINT "CouponUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: OrderItem OrderItem_orderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."OrderItem"
    ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES public."Order"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Order Order_billingInfoId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Order"
    ADD CONSTRAINT "Order_billingInfoId_fkey" FOREIGN KEY ("billingInfoId") REFERENCES public."BillingInfo"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Order Order_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Order"
    ADD CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: User User_assignedCoachId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."User"
    ADD CONSTRAINT "User_assignedCoachId_fkey" FOREIGN KEY ("assignedCoachId") REFERENCES public."Coach"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- PostgreSQL database dump complete
--

