--
-- PostgreSQL database dump
--

\restrict MsS3wTe5pg3VvPPL7hz0OrTjM1xBC3FxMFxS47af8jdh1InSfI4fAfIziuC7Rig

-- Dumped from database version 15.15
-- Dumped by pg_dump version 15.15

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
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
-- Name: cash_movements; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.cash_movements (
    id uuid NOT NULL,
    location_id uuid,
    terminal_id uuid,
    user_id uuid,
    type character varying(50),
    amount numeric(15,2),
    reason text,
    "timestamp" timestamp without time zone DEFAULT now(),
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.cash_movements OWNER TO postgres;

--
-- Name: customers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.customers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    rut character varying(20),
    name character varying(255),
    email character varying(255),
    phone character varying(50),
    address text,
    source character varying(50),
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.customers OWNER TO postgres;

--
-- Name: inventory_batches; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.inventory_batches (
    id uuid NOT NULL,
    product_id uuid,
    sku character varying(50),
    name character varying(255),
    location_id uuid,
    warehouse_id uuid,
    quantity_real integer DEFAULT 0,
    expiry_date timestamp without time zone,
    lot_number character varying(100),
    cost_net numeric(15,2),
    price_sell_box numeric(15,2),
    stock_min integer,
    stock_max integer,
    unit_cost numeric(15,2),
    sale_price numeric(15,2),
    updated_at timestamp without time zone DEFAULT now(),
    source_system character varying(50)
);


ALTER TABLE public.inventory_batches OWNER TO postgres;

--
-- Name: invoice_parsings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.invoice_parsings (
    id uuid NOT NULL,
    status character varying(50),
    original_file_name character varying(255),
    parsed_items jsonb,
    mapped_items integer,
    unmapped_items integer,
    created_by uuid,
    invoice_number character varying(50),
    document_type character varying(50),
    original_file_type character varying(50),
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.invoice_parsings OWNER TO postgres;

--
-- Name: locations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.locations (
    id uuid NOT NULL,
    type character varying(50),
    name character varying(255),
    address text,
    phone character varying(50),
    parent_id uuid,
    default_warehouse_id uuid,
    rut character varying(20),
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.locations OWNER TO postgres;

--
-- Name: products; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.products (
    id uuid NOT NULL,
    sku character varying(50),
    name character varying(255),
    description text,
    sale_price numeric(15,2),
    price numeric(15,2),
    cost_price numeric(15,2),
    stock_min integer,
    stock_max integer,
    stock_actual integer DEFAULT 0
);


ALTER TABLE public.products OWNER TO postgres;

--
-- Name: sale_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.sale_items (
    id uuid NOT NULL,
    sale_id uuid,
    batch_id uuid,
    quantity integer,
    unit_price numeric(15,2),
    total_price numeric(15,2)
);


ALTER TABLE public.sale_items OWNER TO postgres;

--
-- Name: sales; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.sales (
    id uuid NOT NULL,
    location_id uuid,
    terminal_id uuid,
    user_id uuid,
    customer_rut character varying(20),
    total_amount numeric(15,2),
    total numeric(15,2),
    payment_method character varying(50),
    dte_folio integer,
    dte_status character varying(50),
    "timestamp" timestamp without time zone DEFAULT now()
);


ALTER TABLE public.sales OWNER TO postgres;

--
-- Name: stock_movements; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.stock_movements (
    id uuid NOT NULL,
    sku character varying(50),
    product_name character varying(255),
    location_id uuid,
    movement_type character varying(50),
    quantity integer,
    stock_before integer,
    stock_after integer,
    "timestamp" timestamp without time zone DEFAULT now(),
    user_id uuid,
    notes text,
    batch_id uuid,
    reference_type character varying(50),
    reference_id uuid
);


ALTER TABLE public.stock_movements OWNER TO postgres;

--
-- Name: terminals; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.terminals (
    id uuid NOT NULL,
    location_id uuid,
    name character varying(255),
    status character varying(50)
);


ALTER TABLE public.terminals OWNER TO postgres;

--
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    id uuid NOT NULL,
    rut character varying(20),
    name character varying(255),
    role character varying(50),
    access_pin character varying(10),
    pin_hash character varying(255),
    status character varying(50),
    assigned_location_id uuid,
    job_title character varying(100),
    base_salary integer,
    afp character varying(50),
    health_system character varying(100),
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.users OWNER TO postgres;

--
-- Name: warehouses; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.warehouses (
    id uuid NOT NULL,
    location_id uuid,
    name character varying(255),
    is_active boolean DEFAULT true
);


ALTER TABLE public.warehouses OWNER TO postgres;

--
-- Name: cash_movements cash_movements_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cash_movements
    ADD CONSTRAINT cash_movements_pkey PRIMARY KEY (id);


--
-- Name: customers customers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_pkey PRIMARY KEY (id);


--
-- Name: inventory_batches inventory_batches_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventory_batches
    ADD CONSTRAINT inventory_batches_pkey PRIMARY KEY (id);


--
-- Name: invoice_parsings invoice_parsings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoice_parsings
    ADD CONSTRAINT invoice_parsings_pkey PRIMARY KEY (id);


--
-- Name: locations locations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.locations
    ADD CONSTRAINT locations_pkey PRIMARY KEY (id);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: products products_sku_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_sku_key UNIQUE (sku);


--
-- Name: sale_items sale_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sale_items
    ADD CONSTRAINT sale_items_pkey PRIMARY KEY (id);


--
-- Name: sales sales_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sales
    ADD CONSTRAINT sales_pkey PRIMARY KEY (id);


--
-- Name: stock_movements stock_movements_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_pkey PRIMARY KEY (id);


--
-- Name: terminals terminals_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.terminals
    ADD CONSTRAINT terminals_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: warehouses warehouses_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.warehouses
    ADD CONSTRAINT warehouses_pkey PRIMARY KEY (id);


--
-- Name: terminals terminals_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.terminals
    ADD CONSTRAINT terminals_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id);


--
-- Name: warehouses warehouses_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.warehouses
    ADD CONSTRAINT warehouses_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.locations(id);


--
-- PostgreSQL database dump complete
--

\unrestrict MsS3wTe5pg3VvPPL7hz0OrTjM1xBC3FxMFxS47af8jdh1InSfI4fAfIziuC7Rig

