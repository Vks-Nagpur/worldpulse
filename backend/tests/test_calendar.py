from worldpulse.calendar import parse_boe, parse_ecb, parse_elections, parse_fed


def test_fed_panel():
    page = ('<h4><a>2027 FOMC Meetings</a></h4><div class="row fomc-meeting"><div class="fomc-meeting__month col-xs-5"><strong>January</strong></div>'
            '<div class="fomc-meeting__date col-xs-4">26-27</div></div><div class="row fomc-meeting"><div class="fomc-meeting__month"><strong>Apr/May</strong></div>'
            '<div class="fomc-meeting__date">27-28*</div></div>')
    out = parse_fed(page)
    assert [x["date"] for x in out] == ["2027-01-27", "2027-05-28"] and out[1]["note"]


def test_ecb_list():
    page = ('<dl><dt>04/11/2026</dt><dd>Non-monetary policy meeting of the Governing Council</dd>'
            '<dt>17/12/2026</dt><dd>Monetary policy meeting of the Governing Council (Day 2), followed by press conference</dd></dl>')
    assert [x["date"] for x in parse_ecb(page)] == ["2026-12-17"]


def test_boe_dates():
    page = "<h2>2026</h2><p>Thursday 5 November</p><p>Thursday 17 December</p><h2>2027</h2><p>Thursday 4 February</p>"
    assert [x["date"] for x in parse_boe(page)] == ["2026-11-05", "2026-12-17", "2027-02-04"]


def test_elections():
    page = "<h2>November</h2><ul><li>8 November – Brazil, municipal second round</li><li>15 November: Chile, presidential election [ 12 ]</li></ul>"
    out = parse_elections(page, 2026)
    assert ("2026-11-15", "CL") in [(x["date"], x["country"]) for x in out]
    assert all("[" not in x["title"] for x in out)
