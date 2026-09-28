"""
Layer 2: Interoperability Bridge & ISO 20022 Swift Messaging
Grounded in: "The Connective Tissue of Digital Finance"
"""

import random
import time
from typing import List, Optional, Dict, Any
from .models import ISO20022Message, AssetType, LedgerZone


def generate_iso20022_xml(msg_id: str, sender: str, receiver: str, amount: float,
                           asset_type: AssetType, src: LedgerZone, dst: LedgerZone) -> str:
    """Generates a realistic ISO 20022 pacs.008.001.10 XML payload snippet."""
    timestamp = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.008.001.10">
  <FIToFICstmrCdtTrf>
    <GrpHdr>
      <MsgId>{msg_id}</MsgId>
      <CreDtTm>{timestamp}</CreDtTm>
      <NbOfTxs>1</NbOfTxs>
      <SttlmInf>
        <SttlmMtd>CLRG</SttlmMtd>
        <ClrSys>
          <Prtry>SWIFT_INTEROP_{src.value.upper()}_TO_{dst.value.upper()}</Prtry>
        </ClrSys>
      </SttlmInf>
    </GrpHdr>
    <CdtTrfTxInf>
      <PmtId>
        <EndToEndId>E2E-{msg_id}</EndToEndId>
        <TxId>TX-{msg_id}</TxId>
      </PmtId>
      <IntrBkSttlmAmt Ccy="USD">{amount:.2f}</IntrBkSttlmAmt>
      <IntrBkSttlmDt>{time.strftime('%Y-%m-%d')}</IntrBkSttlmDt>
      <Dbtr>
        <Nm>{sender}</Nm>
        <Id><OrgId><AnyBIC>{src.value[:8].upper()}XXX</AnyBIC></OrgId></Id>
      </Dbtr>
      <Cdtr>
        <Nm>{receiver}</Nm>
        <Id><OrgId><AnyBIC>{dst.value[:8].upper()}XXX</AnyBIC></OrgId></Id>
      </Cdtr>
      <SplmtryData>
        <PlcAndNm>MultiAssetTokenizationProtocol</PlcAndNm>
        <Envlp>
          <TokenStandard>{asset_type.value}</TokenStandard>
          <LedgerRouting>CrossZoneBridge</LedgerRouting>
        </Envlp>
      </SplmtryData>
    </CdtTrfTxInf>
  </FIToFICstmrCdtTrf>
</Document>"""
    return xml.strip()


class InteroperabilityBridge:
    def __init__(self, base_latency: int = 2, failure_rate: float = 0.02):
        self.base_latency = base_latency
        self.failure_rate = failure_rate
        self.message_queue: List[ISO20022Message] = []
        self.processed_messages: List[ISO20022Message] = []
        self.total_dispatched = 0
        self.total_delivered = 0
        self.total_failed = 0

    def update_config(self, base_latency: Optional[int] = None, failure_rate: Optional[float] = None):
        if base_latency is not None:
            self.base_latency = max(1, base_latency)
        if failure_rate is not None:
            self.failure_rate = max(0.0, min(1.0, failure_rate))

    def dispatch_payment(self, sender: str, receiver: str, amount: float,
                          asset_type: AssetType, src: LedgerZone, dst: LedgerZone,
                          step_number: int = 0) -> ISO20022Message:
        seq = random.randint(1000, 9999)
        msg_id = f"pacs.008.{int(time.time() * 1000)}.{seq}"
        latency = self.base_latency + (1 if src != dst else 0)
        
        xml_payload = generate_iso20022_xml(msg_id, sender, receiver, amount, asset_type, src, dst)

        msg = ISO20022Message(
            msg_id=msg_id,
            message_type="pacs.008.001.10",
            sender=sender,
            receiver=receiver,
            amount=amount,
            asset_type=asset_type,
            source_ledger=src,
            target_ledger=dst,
            latency_cycles=latency,
            initial_latency=latency,
            status="IN_TRANSIT",
            created_at_step=step_number,
            xml_payload=xml_payload
        )
        self.message_queue.append(msg)
        self.total_dispatched += 1
        return msg

    def tick(self) -> List[ISO20022Message]:
        delivered = []
        # Copy queue to iterate safely
        for msg in list(self.message_queue):
            msg.latency_cycles -= 1
            if msg.latency_cycles <= 0:
                if random.random() < self.failure_rate:
                    reasons = [
                        "ISO_20022_VALIDATION_SYNTAX_ERROR",
                        "LEDGER_CROSS_CHAIN_HASH_LOCK_TIMEOUT",
                        "INSUFFICIENT_CROSS_BRIDGE_LIQUIDITY",
                        "SMART_CONTRACT_SIGNATURE_VERIFICATION_FAILED"
                    ]
                    msg.status = "FAILED"
                    msg.error_reason = random.choice(reasons)
                    self.message_queue.remove(msg)
                    self.processed_messages.append(msg)
                    self.total_failed += 1
                else:
                    msg.status = "DELIVERED"
                    self.message_queue.remove(msg)
                    self.processed_messages.append(msg)
                    self.total_delivered += 1
                    delivered.append(msg)
            else:
                msg.status = "IN_TRANSIT"
        return delivered

    def get_in_transit_messages(self) -> List[Dict[str, Any]]:
        return [msg.to_dict() for msg in self.message_queue]

    def get_recent_messages(self, limit: int = 50) -> List[Dict[str, Any]]:
        all_msgs = self.message_queue + list(reversed(self.processed_messages))
        return [msg.to_dict() for msg in all_msgs[:limit]]

    def reset(self):
        self.message_queue.clear()
        self.processed_messages.clear()
        self.total_dispatched = 0
        self.total_delivered = 0
        self.total_failed = 0
