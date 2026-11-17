create table pajang_private.question_catalog (
  id integer primary key check (id > 0),
  prompt text not null unique check (length(trim(prompt)) > 0),
  occasion text,
  edition smallint,
  turn smallint,
  unique(occasion,edition,turn),
  check ((occasion is null and edition is null and turn is null)
    or (occasion is not null and edition is not null and edition in (0,1) and turn is not null and turn >= 0)),
  samples text[] not null check (
    array_ndims(samples) = 1 and cardinality(samples) = 3
    and array_position(samples, null) is null and array_position(samples, '') is null
  )
);
alter table pajang_private.question_catalog enable row level security;
revoke all on table pajang_private.question_catalog from public, anon, authenticated;

-- Korean lunar 1/1 and 8/15, regular months, converted in the Korean calendar.
-- Sources: KASA annual almanac (2026/2027), KoreanLunarCalendar by usingsky (through 2050).
create table pajang_private.lunar_festivals (
  year smallint primary key, seollal date not null, chuseok date not null,
  check(extract(year from seollal)=year and extract(year from chuseok)=year and seollal<chuseok)
);
alter table pajang_private.lunar_festivals enable row level security;
revoke all on table pajang_private.lunar_festivals from public,anon,authenticated;
insert into pajang_private.lunar_festivals(year,seollal,chuseok) values
  (2026, date '2026-02-17', date '2026-09-25'),
  (2027, date '2027-02-07', date '2027-09-15'),
  (2028, date '2028-01-27', date '2028-10-03'),
  (2029, date '2029-02-13', date '2029-09-22'),
  (2030, date '2030-02-03', date '2030-09-12'),
  (2031, date '2031-01-23', date '2031-10-01'),
  (2032, date '2032-02-11', date '2032-09-19'),
  (2033, date '2033-01-31', date '2033-09-08'),
  (2034, date '2034-02-19', date '2034-09-27'),
  (2035, date '2035-02-08', date '2035-09-16'),
  (2036, date '2036-01-28', date '2036-10-04'),
  (2037, date '2037-02-15', date '2037-09-24'),
  (2038, date '2038-02-04', date '2038-09-13'),
  (2039, date '2039-01-24', date '2039-10-02'),
  (2040, date '2040-02-12', date '2040-09-21'),
  (2041, date '2041-02-01', date '2041-09-10'),
  (2042, date '2042-01-22', date '2042-09-28'),
  (2043, date '2043-02-10', date '2043-09-17'),
  (2044, date '2044-01-30', date '2044-10-05'),
  (2045, date '2045-02-17', date '2045-09-25'),
  (2046, date '2046-02-06', date '2046-09-15'),
  (2047, date '2047-01-26', date '2047-10-04'),
  (2048, date '2048-02-14', date '2048-09-22'),
  (2049, date '2049-02-02', date '2049-09-11'),
  (2050, date '2050-01-23', date '2050-09-30');
