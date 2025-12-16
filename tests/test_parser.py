import sys
import os
import unittest

# Add project root to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from src.modules.drug_parser import DrugParser

class TestDrugParser(unittest.TestCase):
    
    def test_standard_case(self):
        # "ACICLOVIR 200 MG X25 COMP LAB CHILE."
        raw = "ACICLOVIR 200 MG X25 COMP LAB CHILE."
        res = DrugParser.parse(raw)
        self.assertEqual(res['clean_name'], "ACICLOVIR")
        self.assertEqual(res['dose_val'], "200")
        self.assertEqual(res['dose_unit'], "MG")
        self.assertEqual(res['qty_val'], "25")
        self.assertEqual(res['qty_unit'], "COMP")
        self.assertEqual(res['lab'], "CHILE.")

    def test_mixed_case(self):
        # "AARTFENACIN FEXOFENADINA CLORHIDRATO 180MG 30 COMP. LAB PHARMARIS"
        raw = "AARTFENACIN FEXOFENADINA CLORHIDRATO 180MG 30 COMP. LAB PHARMARIS"
        res = DrugParser.parse(raw)
        # Should contain the brand and generic in the name for now, 
        # splitting them requires the ISP Database matching step.
        self.assertTrue("AARTFENACIN" in res['clean_name'])
        self.assertTrue("FEXOFENADINA" in res['clean_name'])
        self.assertEqual(res['dose_val'], "180")
        self.assertEqual(res['qty_val'], "30")
        self.assertEqual(res['lab'], "PHARMARIS")

    def test_ofteno_case(self):
        # "3-A OFTENO DICLOFENACO SODICO 10MG X5ML LAB SOPHIA"
        raw = "3-A OFTENO DICLOFENACO SODICO 10MG X5ML LAB SOPHIA"
        res = DrugParser.parse(raw)
        self.assertEqual(res['dose_val'], "10")
        self.assertEqual(res['dose_unit'], "MG")
        self.assertEqual(res['qty_val'], "5")
        self.assertEqual(res['qty_unit'], "ML")
        self.assertIn("OFTENO", res['clean_name'])
        self.assertIn("DICLOFENACO", res['clean_name'])

    def test_inhaler_case(self):
        # "AEROLIN SALBUTAMOL 100MCG 200DOSIS LAB. GSK"
        raw = "AEROLIN SALBUTAMOL 100MCG 200DOSIS LAB. GSK"
        res = DrugParser.parse(raw)
        self.assertEqual(res['dose_val'], "100")
        self.assertEqual(res['dose_unit'], "MCG")
        self.assertEqual(res['qty_val'], "200")
        self.assertEqual(res['qty_unit'], "DOSIS")

if __name__ == '__main__':
    unittest.main()
